"""Candidate forecast features, by name. MUST stay identical to tgcloud/lib/forecast/features.js —
test/forecast.test.js checks every candidate in JS against vectors exported from here.

A raw window for an issue hour t (UTC):
  pm:     25 island-mean PM2.5 values, hours t-24..t (last = t)
  blh, ws, wd, precip: 25 values, hours t..t+24 (index = offset from t)
  aq:     {point: 25 values, hours t..t+24} for the points in config.POINTS
  hour_utc: hour of day of t in UTC

The model predicts the change from base(raw) = log1p(current PM2.5), so the current reading
itself is not a feature.
"""

import math


def log1p_pos(x):
    return math.log1p(max(x, 0.0))


def _mean(xs):
    return sum(xs) / len(xs)


def _wind(raw, h):
    """(u, v) in km/h toward the east and north, from speed and the direction it blows from."""
    ws = raw["ws"][h]
    wd = math.radians(raw["wd"][h])
    return -ws * math.sin(wd), -ws * math.cos(wd)


def _target_hour(raw, h):
    return (raw["hour_utc"] + 8 + h) % 24  # SGT hour of the forecast target


def _sumatra(raw):
    aq = raw["aq"]
    return log1p_pos(_mean([aq["riau"][0], aq["jambi"][0], aq["palembang"][0]]))


# name: (group, raw inputs it needs, fn(raw, h))
CANDIDATES = {
    "y1": ("recent", ["pm"], lambda r, h: log1p_pos(r["pm"][23])),
    "y3": ("recent", ["pm"], lambda r, h: log1p_pos(_mean(r["pm"][22:25]))),
    "y24": ("recent", ["pm"], lambda r, h: log1p_pos(_mean(r["pm"][1:25]))),
    "dy3": ("recent", ["pm"], lambda r, h: log1p_pos(r["pm"][24]) - log1p_pos(r["pm"][21])),
    "hour_sin": ("time", [], lambda r, h: math.sin(2 * math.pi * _target_hour(r, h) / 24)),
    "hour_cos": ("time", [], lambda r, h: math.cos(2 * math.pi * _target_hour(r, h) / 24)),
    "log_blh": ("mixing", ["blh"], lambda r, h: math.log(max(r["blh"][h], 50.0))),
    "wind_speed": ("wind", ["ws"], lambda r, h: r["ws"][h]),
    "wind_u": ("wind", ["ws", "wd"], lambda r, h: _wind(r, h)[0]),
    "wind_v": ("wind", ["ws", "wd"], lambda r, h: _wind(r, h)[1]),
    "rain": ("rain", ["precip"], lambda r, h: math.log1p(sum(r["precip"][1 : h + 1]))),
    "cams_sg_h": ("cams", ["aq:sg"], lambda r, h: log1p_pos(r["aq"]["sg"][h])),
    "cams_sg_0": ("cams", ["aq:sg"], lambda r, h: log1p_pos(r["aq"]["sg"][0])),
    "sumatra": ("upstream", ["aq:riau", "aq:jambi", "aq:palembang"], lambda r, h: _sumatra(r)),
    "batam": ("upstream", ["aq:batam"], lambda r, h: log1p_pos(r["aq"]["batam"][0])),
    "kalimantan": ("upstream", ["aq:kalbar"], lambda r, h: log1p_pos(r["aq"]["kalbar"][0])),
    # smoke from the south-west, carried by SW winds
    "sumatra_x_sw": (
        "upstream",
        ["aq:riau", "aq:jambi", "aq:palembang", "ws", "wd"],
        lambda r, h: _sumatra(r) * max(sum(_wind(r, h)), 0.0) / 14,
    ),
    # smoke from the east, carried by easterlies
    "kalimantan_x_e": (
        "upstream",
        ["aq:kalbar", "ws", "wd"],
        lambda r, h: log1p_pos(r["aq"]["kalbar"][0]) * max(-_wind(r, h)[0], 0.0) / 10,
    ),
}

GROUP_LABELS = {
    "recent": "Recent PM2.5 trend",
    "time": "Time of day",
    "mixing": "Mixing height (how much the air can disperse)",
    "wind": "Wind",
    "rain": "Rain",
    "cams": "Smoke model over Singapore (CAMS)",
    "upstream": "Smoke over nearby Sumatra, Batam and Kalimantan",
}


def base(raw):
    """log1p of the current island-mean PM2.5: the level the model adds its predicted change to."""
    return log1p_pos(raw["pm"][24])


def features(raw, h, names):
    return [CANDIDATES[n][2](raw, h) for n in names]


def names_in(groups):
    return [n for n, (g, _, _) in CANDIDATES.items() if g in groups]
