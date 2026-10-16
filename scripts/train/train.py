"""Build the dataset, fit quantile models per horizon, backtest, export JS coefficients.

Run (after fetch.py): uv run --project scripts/train python scripts/train/train.py
"""

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import QuantileRegressor

from config import HORIZONS, POINTS, QUANTILES
from features import FEATURES, GROUP_LABELS, NAMES, features

HERE = Path(__file__).parent
CACHE = HERE / ".cache"
ROOT = HERE.parent.parent
REGIONS = ["north", "west", "central", "east", "south"]

TRAIN_END = datetime(2026, 9, 16, tzinfo=timezone.utc)  # includes the start of the 2026 episode
CALIB_END = datetime(2026, 10, 1, tzinfo=timezone.utc)  # 16–30 Sep tunes the range; October is unseen
HAZE_UG = 35  # PM2.5 above this (≈ PSI 75) counts as a haze hour for weighting
HAZE_WEIGHT = 10.0
# Groups that beat persistence in the October 2026 ablation. "recent" (beyond the current
# reading) and "upstream" pulled forecasts toward clean air; mixing height didn't help.
USE_GROUPS = {"time", "cams", "wind", "rain"}


def hour_key(dt: datetime) -> int:
    return int(dt.timestamp()) // 3600


def load_series():
    """Hourly dicts keyed by unix hour (UTC)."""
    pm = {}
    for f in sorted((CACHE / "nea").glob("*.json")):
        for item in json.loads(f.read_text()):
            vals = [item["pm25"].get(r) for r in REGIONS]
            vals = [v for v in vals if v is not None]
            if vals:
                pm[hour_key(datetime.fromisoformat(item["t"]))] = sum(vals) / len(vals)

    def om(hourly, key):
        out = {}
        for t, v in zip(hourly["time"], hourly[key]):
            if v is not None:
                out[hour_key(datetime.fromisoformat(t).replace(tzinfo=timezone.utc))] = float(v)
        return out

    w = json.loads((CACHE / "weather.json").read_text())["hourly"]
    weather = {
        k: om(w, src)
        for k, src in [
            ("blh", "boundary_layer_height"),
            ("ws", "wind_speed_10m"),
            ("wd", "wind_direction_10m"),
            ("precip", "precipitation"),
        ]
    }
    aq_raw = json.loads((CACHE / "aq.json").read_text())
    aq = {name: om(aq_raw[name]["hourly"], "pm2_5") for name in POINTS}
    return pm, weather, aq


def window(t, pm, weather, aq):
    """Raw window for issue hour t, or None if anything is missing."""
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
    rows = {h: ([], [], []) for h in HORIZONS}  # X, y, t
    for t in sorted(pm):
        raw = window(t, pm, weather, aq)
        if raw is None:
            continue
        for h in HORIZONS:
            target = pm.get(t + h)
            if target is None:
                continue
            X, y, ts = rows[h]
            X.append(features(raw, h))
            y.append(math.log1p(target))
            ts.append(t)
    return {h: tuple(np.array(a) for a in rows[h]) for h in HORIZONS}


# NEA PM2.5 sub-index breakpoints — same as tgcloud/lib/psi.js
BP = [(0, 0), (12, 50), (55, 100), (150, 200), (250, 300), (350, 400), (500, 500)]


def psi(pm25):
    c = np.maximum(pm25, 0)
    out = np.empty_like(c)
    for i in range(1, len(BP)):
        (c0, i0), (c1, i1) = BP[i - 1], BP[i]
        m = (c >= c0) & ((c <= c1) | (i == len(BP) - 1))
        out[m] = i0 + (c[m] - c0) * (i1 - i0) / (c1 - c0)
    return np.round(out)


USE = np.array([g in USE_GROUPS for _, g in FEATURES])


def fit_horizon(X, y, ts):
    tr = ts < hour_key(TRAIN_END)
    ca = (ts >= hour_key(TRAIN_END)) & (ts < hour_key(CALIB_END))
    te = ts >= hour_key(CALIB_END)
    mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-9
    # Unused features get mean 0 / scale 1 / weight 0, so the JS side can stay generic.
    mu = np.where(USE, mu, 0.0)
    sd = np.where(USE, sd, 1.0)
    Z = (X - mu) / sd
    # Predict the change from the current reading (log space), not the level: in a mostly-clean
    # history the level model learns "fall back to clean air", which is wrong during haze.
    d = y - X[:, 0]
    # Subsample clean hours for speed (consecutive hours are highly correlated); keep every haze hour.
    haze_row = np.expm1(X[:, 0]) > HAZE_UG
    idx = np.where(tr & (haze_row | (np.arange(len(y)) % 2 == 0)))[0]
    weight = np.where(haze_row[idx], HAZE_WEIGHT, 1.0)
    models = {}
    for q in QUANTILES:
        m = QuantileRegressor(quantile=q, alpha=1e-4, solver="highs").fit(Z[idx][:, USE], d[idx], sample_weight=weight)
        coef = np.zeros(X.shape[1])
        coef[USE] = m.coef_
        models[q] = (m.intercept_, coef)

    def pred(q, Zs, rows):
        b, w = models[q]
        return X[rows, 0] + b + Zs @ w

    # Conformalised widening (CQR) so the 10–90% band covers ~80% on unseen hours.
    lo, hi = pred(0.1, Z[ca], ca), pred(0.9, Z[ca], ca)
    scores = np.maximum(lo - y[ca], y[ca] - hi)
    widen = float(np.quantile(scores, 0.8)) if ca.any() else 0.0

    def evaluate(mask):
        if not mask.any():
            return None
        obs = psi(np.expm1(y[mask]))
        med = psi(np.expm1(pred(0.5, Z[mask], mask)))
        lo_ = psi(np.expm1(pred(0.1, Z[mask], mask) - widen))
        hi_ = psi(np.expm1(pred(0.9, Z[mask], mask) + widen))
        persist = psi(np.expm1(X[mask][:, 0]))
        return {
            "n": int(mask.sum()),
            "mae_psi": round(float(np.abs(med - obs).mean()), 2),
            "persistence_mae_psi": round(float(np.abs(persist - obs).mean()), 2),
            "coverage_80": round(float(((obs >= lo_) & (obs <= hi_)).mean()), 3),
        }

    haze = te & (np.expm1(X[:, 0]) > 55)  # test hours that start above PSI 100
    report = {"calibration": evaluate(ca), "test": evaluate(te), "test_haze_hours": evaluate(haze)}
    return {"mu": mu, "sd": sd, "models": models, "widen": widen, "median_x": np.median(X[tr], 0)}, report


def export(fitted, reports, n_rows):
    groups = sorted({g for _, g in FEATURES})
    model = {
        "version": 3,
        "target": "delta",  # prediction = y0 + b + w·z (log1p PM2.5)
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "trainEnd": TRAIN_END.date().isoformat(),
        "features": NAMES,
        "groups": {g: [i for i, (_, gg) in enumerate(FEATURES) if gg == g] for g in groups if g in USE_GROUPS},
        "groupLabels": GROUP_LABELS,
        "horizons": {},
    }
    for h, f in fitted.items():
        model["horizons"][str(h)] = {
            "mean": [round(float(x), 6) for x in f["mu"]],
            "scale": [round(float(x), 6) for x in f["sd"]],
            "typical": [round(float(x), 6) for x in f["median_x"]],
            "widen": round(f["widen"], 6),
            "q": {
                str(q): {"b": round(float(b), 6), "w": [round(float(x), 6) for x in w]}
                for q, (b, w) in f["models"].items()
            },
        }
    js = (
        "// Generated by scripts/train/train.py — do not edit by hand.\n"
        f"// Rows per horizon: {n_rows}. Backtest: scripts/train/report.json.\n"
        f"export const MODEL = {json.dumps(model, separators=(',', ':'))};\n"
    )
    out = ROOT / "tgcloud" / "lib" / "forecast" / "model.js"
    out.write_text(js)
    (HERE / "report.json").write_text(json.dumps(reports, indent=2) + "\n")


def export_parity_vectors(pm, weather, aq, fitted):
    """A few real raw windows + expected features/predictions for the JS parity test."""
    ts = [t for t in sorted(pm) if t >= hour_key(CALIB_END)]
    picked = []
    for t in ts[:: max(1, len(ts) // 6)]:
        raw = window(t, pm, weather, aq)
        if raw is None:
            continue
        exp = {}
        for h in HORIZONS:
            # Same rounding as the exported model, so JS and Python agree to ~1e-6.
            f = fitted[h]
            mu = np.round(f["mu"], 6)
            sd = np.round(f["sd"], 6)
            b, w = f["models"][0.5]
            x = np.array(features(raw, h))
            z = (x - mu) / sd
            exp[str(h)] = {"features": x.tolist(), "q50_log": float(x[0] + round(float(b), 6) + z @ np.round(w, 6))}
        picked.append({"raw": raw, "expected": exp})
        if len(picked) == 3:
            break
    (ROOT / "test" / "forecast-vectors.json").write_text(json.dumps(picked) + "\n")


def main():
    pm, weather, aq = load_series()
    print(f"hours: pm {len(pm)}, weather {len(weather['blh'])}, aq {len(aq['sg'])}")
    data = build(pm, weather, aq)
    fitted, reports = {}, {}
    for h in HORIZONS:
        X, y, ts = data[h]
        print(f"h={h}: {len(y)} rows, fitting…", flush=True)
        fitted[h], reports[f"+{h}h"] = fit_horizon(X, y, ts)
        print(json.dumps(reports[f"+{h}h"]), flush=True)
    export(fitted, reports, {h: len(data[h][1]) for h in HORIZONS})
    export_parity_vectors(pm, weather, aq, fitted)
    print("wrote tgcloud/lib/forecast/model.js, scripts/train/report.json, test/forecast-vectors.json")


if __name__ == "__main__":
    main()
