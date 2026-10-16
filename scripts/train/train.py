"""Build the dataset, choose input groups, fit quantile models per horizon, backtest, export JS.

Run (after fetch.py): uv run --project scripts/train python scripts/train/train.py

Splits (by issue hour, UTC):
  train        < TRAIN_END          everything up to the end of September 2026
  calibration  TRAIN_END..TEST_START  first week of October: picks input groups, widens the range
  test         >= TEST_START        unseen; reported in report.json, never used for any choice
"""

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import QuantileRegressor

from config import HORIZONS, POINTS, QUANTILES
from features import CANDIDATES, GROUP_LABELS, base, features, names_in

HERE = Path(__file__).parent
CACHE = HERE / ".cache"
ROOT = HERE.parent.parent
REGIONS = ["north", "west", "central", "east", "south"]

TRAIN_END = datetime(2026, 10, 1, tzinfo=timezone.utc)
TEST_START = datetime(2026, 10, 8, tzinfo=timezone.utc)
HAZE_UG = 35  # current PM2.5 above this (≈ PSI 75) counts as a haze hour for weighting
PSI100_UG = 55  # PM2.5 at PSI 100: the "haze hours" slice of the test report
HAZE_WEIGHT = 10.0
ALL_NAMES = list(CANDIDATES)
ALL_GROUPS = sorted({g for g, _, _ in CANDIDATES.values()})

# NEA PM2.5 sub-index breakpoints. test/forecast.test.js checks these against tgcloud/lib/psi.js.
BP = [(0, 0), (12, 50), (55, 100), (150, 200), (250, 300), (350, 400), (500, 500)]


def hour_key(dt: datetime) -> int:
    return int(dt.timestamp()) // 3600


def psi(pm25):
    c = np.maximum(np.asarray(pm25, dtype=float), 0)
    out = np.empty_like(c)
    for i in range(1, len(BP)):
        (c0, i0), (c1, i1) = BP[i - 1], BP[i]
        m = (c >= c0) & ((c <= c1) | (i == len(BP) - 1))
        out[m] = i0 + (c[m] - c0) * (i1 - i0) / (c1 - c0)
    return np.round(out)


def load_series():
    """Hourly dicts keyed by unix hour (UTC)."""
    pm = {}
    for f in sorted((CACHE / "nea").glob("*.json")):
        for item in json.loads(f.read_text()):
            vals = [v for v in (item["pm25"].get(r) for r in REGIONS) if v is not None]
            if vals:
                pm[hour_key(datetime.fromisoformat(item["t"]))] = sum(vals) / len(vals)

    def series(hourly, key):
        return {
            hour_key(datetime.fromisoformat(t).replace(tzinfo=timezone.utc)): float(v)
            for t, v in zip(hourly["time"], hourly[key])
            if v is not None
        }

    fc = json.loads((CACHE / "weather_fc.json").read_text())["hourly"]
    era5 = json.loads((CACHE / "era5.json").read_text())["hourly"]
    weather = {
        "ws": series(fc, "wind_speed_10m"),
        "wd": series(fc, "wind_direction_10m"),
        "precip": series(fc, "precipitation"),
        "blh": series(era5, "boundary_layer_height"),
    }
    aq_raw = json.loads((CACHE / "aq.json").read_text())
    aq = {name: series(aq_raw[name]["hourly"], "pm2_5") for name in POINTS}
    return pm, weather, aq


def window(t, pm, weather, aq):
    """Raw window for issue hour t, or None if anything is missing (training skips gaps)."""
    try:
        return {
            "pm": [pm[t - 24 + i] for i in range(25)],
            **{k: [weather[k][t + i] for i in range(25)] for k in weather},
            "aq": {n: [aq[n][t + i] for i in range(25)] for n in POINTS},
            "hour_utc": t % 24,
        }
    except KeyError:
        return None


def build(pm, weather, aq):
    """Per horizon: X (all candidates), base, target (log1p PM2.5 at t+h), issue hour."""
    rows = {h: ([], [], [], []) for h in HORIZONS}
    for t in sorted(pm):
        raw = window(t, pm, weather, aq)
        if raw is None:
            continue
        b = base(raw)
        for h in HORIZONS:
            target = pm.get(t + h)
            if target is None:
                continue
            X, B, y, ts = rows[h]
            X.append(features(raw, h, ALL_NAMES))
            B.append(b)
            y.append(math.log1p(target))
            ts.append(t)
    return {h: tuple(np.array(a) for a in rows[h]) for h in HORIZONS}


class Split:
    def __init__(self, ts):
        self.train = ts < hour_key(TRAIN_END)
        self.calib = (ts >= hour_key(TRAIN_END)) & (ts < hour_key(TEST_START))
        self.test = ts >= hour_key(TEST_START)


def fit(X, B, y, split, cols, quantiles=QUANTILES):
    """Quantile models on the change from base, haze hours weighted. Returns (mu, sd, {q: (b, w)})."""
    tr = split.train
    mu = X[tr][:, cols].mean(0)
    sd = X[tr][:, cols].std(0) + 1e-9
    Z = (X[:, cols] - mu) / sd
    d = y - B
    haze = np.expm1(B) > HAZE_UG
    # Keep every haze hour; thin clean hours (consecutive hours are highly correlated).
    idx = np.where(tr & (haze | (np.arange(len(y)) % 2 == 0)))[0]
    weight = np.where(haze[idx], HAZE_WEIGHT, 1.0)
    models = {}
    for q in quantiles:
        if cols:
            m = QuantileRegressor(quantile=q, alpha=1e-4, solver="highs").fit(Z[idx], d[idx], sample_weight=weight)
            models[q] = (float(m.intercept_), m.coef_)
        else:
            models[q] = (float(np.quantile(np.repeat(d[idx], weight.astype(int)), q)), np.zeros(0))
    return mu, sd, models


def predict(X, B, cols, mu, sd, model):
    b, w = model
    return B + b + ((X[:, cols] - mu) / sd) @ w


def mae_psi(pred_log, y):
    return float(np.abs(psi(np.expm1(pred_log)) - psi(np.expm1(y))).mean())


def choose_groups(data):
    """Greedy forward selection on the calibration week: add the group that most lowers the
    median-forecast error (summed over horizons, relative to persistence); stop when none helps."""
    cols_of = {g: [ALL_NAMES.index(n) for n in names_in({g})] for g in ALL_GROUPS}

    def score(groups):
        total = 0.0
        for h in HORIZONS:
            X, B, y, ts = data[h]
            s = Split(ts)
            cols = sorted(c for g in groups for c in cols_of[g])
            mu, sd, models = fit(X, B, y, s, cols, quantiles=[0.5])
            total += mae_psi(predict(X[s.calib], B[s.calib], cols, mu, sd, models[0.5]), y[s.calib]) / max(
                mae_psi(B[s.calib], y[s.calib]), 1e-9
            )
        return total / len(HORIZONS)

    chosen, best = [], score([])
    trail = [{"groups": [], "relative_mae": round(best, 4)}]
    while True:
        trials = {g: score(chosen + [g]) for g in ALL_GROUPS if g not in chosen}
        if not trials:
            break
        g, s = min(trials.items(), key=lambda kv: kv[1])
        if s >= best - 0.002:  # needs a real improvement, not noise
            break
        chosen.append(g)
        best = s
        trail.append({"groups": list(chosen), "relative_mae": round(s, 4)})
        print(f"  + {g}: relative MAE {s:.4f}", flush=True)
    return chosen, trail


def evaluate(mask, X, B, y, cols, mu, sd, models, widen):
    if not mask.any():
        return None
    obs = psi(np.expm1(y[mask]))
    q50 = predict(X[mask], B[mask], cols, mu, sd, models[0.5])
    # Same crossing guard as predict.js: lo ≤ median ≤ hi (widen can be negative).
    q10 = np.minimum(predict(X[mask], B[mask], cols, mu, sd, models[0.1]) - widen, q50)
    q90 = np.maximum(predict(X[mask], B[mask], cols, mu, sd, models[0.9]) + widen, q50)
    med, lo, hi = (psi(np.expm1(q)) for q in (q50, q10, q90))
    persist = psi(np.expm1(B[mask]))
    return {
        "n": int(mask.sum()),
        "mae_psi": round(float(np.abs(med - obs).mean()), 2),
        "persistence_mae_psi": round(float(np.abs(persist - obs).mean()), 2),
        "coverage_80": round(float(((obs >= lo) & (obs <= hi)).mean()), 3),
    }


def needs_for(names):
    needs = sorted({need for n in names for need in CANDIDATES[n][1]} - {"pm"})
    return {
        "weather": [k for k in needs if not k.startswith("aq:")],
        "aq": [k.removeprefix("aq:") for k in needs if k.startswith("aq:")],
    }


def main():
    pm, weather, aq = load_series()
    print(f"hours: pm {len(pm)}, wind {len(weather['ws'])}, aq {len(aq['sg'])}")
    data = build(pm, weather, aq)

    print("choosing input groups on the calibration week…")
    groups, trail = choose_groups(data)
    names = names_in(set(groups))
    cols = [ALL_NAMES.index(n) for n in names]
    print(f"groups: {groups} → {len(names)} features")

    report = {"groups": groups, "selection": trail, "splits": {
        "train_end": TRAIN_END.isoformat(), "test_start": TEST_START.isoformat()}, "horizons": {}}
    model = {
        "version": 4,
        "target": "delta",  # level = base + b + w·z, in log1p(PM2.5)
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "features": names,
        "groups": {g: [names.index(n) for n in names_in({g})] for g in groups},
        "groupLabels": {g: GROUP_LABELS[g] for g in groups},
        "needs": needs_for(names),
        # Singapore (weather) plus any air-quality points the chosen features read.
        "points": {p: list(POINTS[p]) for p in ["sg", *needs_for(names)["aq"]]},
        "horizons": {},
    }
    fitted = {}
    for h in HORIZONS:
        X, B, y, ts = data[h]
        s = Split(ts)
        mu, sd, models = fit(X, B, y, s, cols)
        # Conformalised widening (CQR) on the calibration week, so the 10–90% band covers ~80%.
        lo = predict(X[s.calib], B[s.calib], cols, mu, sd, models[0.1])
        hi = predict(X[s.calib], B[s.calib], cols, mu, sd, models[0.9])
        widen = float(np.quantile(np.maximum(lo - y[s.calib], y[s.calib] - hi), 0.8))
        haze = np.expm1(B) > PSI100_UG
        report["horizons"][f"+{h}h"] = {
            "calibration": evaluate(s.calib, X, B, y, cols, mu, sd, models, widen),
            "test": evaluate(s.test, X, B, y, cols, mu, sd, models, widen),
            "test_haze_hours": evaluate(s.test & haze, X, B, y, cols, mu, sd, models, widen),
        }
        print(f"h={h}: {json.dumps(report['horizons'][f'+{h}h']['test'])}", flush=True)
        fitted[h] = (mu, sd, models)
        model["horizons"][str(h)] = {
            "mean": [round(float(x), 6) for x in mu],
            "scale": [round(float(x), 6) for x in sd],
            "typical": [round(float(x), 6) for x in np.median(X[s.train][:, cols], 0)],
            "widen": round(widen, 6),
            "q": {str(q): {"b": round(b, 6), "w": [round(float(x), 6) for x in w]} for q, (b, w) in models.items()},
        }

    cover = [r["test"]["coverage_80"] for r in report["horizons"].values() if r["test"]]
    # What the UI may honestly claim about the range: how often it held on the unseen test week.
    model["backtest"] = {"testFrom": TEST_START.date().isoformat(), "coverage": [min(cover), max(cover)]}
    (ROOT / "tgcloud" / "lib" / "forecast" / "model.js").write_text(
        "// Generated by scripts/train/train.py — do not edit by hand. Backtest: scripts/train/report.json.\n"
        f"export const MODEL = {json.dumps(model, separators=(',', ':'))};\n"
    )
    (HERE / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    export_parity_vectors(pm, weather, aq, model)
    print("wrote tgcloud/lib/forecast/model.js, scripts/train/report.json, test/forecast-vectors.json")


def export_parity_vectors(pm, weather, aq, model):
    """Real raw windows with every candidate feature and the exported model's median, plus PSI
    samples, for the JS parity test."""
    ts = [t for t in sorted(pm) if t >= hour_key(TRAIN_END)]
    windows = []
    for t in ts[:: max(1, len(ts) // 6)]:
        raw = window(t, pm, weather, aq)
        if raw is None:
            continue
        expected = {}
        for h in HORIZONS:
            m = model["horizons"][str(h)]
            x = np.array(features(raw, h, model["features"]))
            q = m["q"]["0.5"]
            z = (x - np.array(m["mean"])) / np.array(m["scale"])
            expected[str(h)] = {
                "candidates": dict(zip(ALL_NAMES, features(raw, h, ALL_NAMES))),
                "q50_log": float(base(raw) + q["b"] + z @ np.array(q["w"])),
            }
        windows.append({"raw": raw, "expected": expected})
        if len(windows) == 3:
            break
    samples = [0, 5, 12, 13, 30, 55, 56, 100, 150, 151, 200, 250, 300, 350, 420, 500, 650]
    (ROOT / "test" / "forecast-vectors.json").write_text(
        json.dumps({"psi": [[c, float(psi([c])[0])] for c in samples], "windows": windows})
        + "\n"
    )


if __name__ == "__main__":
    main()
