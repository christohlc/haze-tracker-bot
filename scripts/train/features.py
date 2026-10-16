"""Forecast features. MUST stay identical to tgcloud/lib/forecast/features.js —
test/forecast.test.js checks the JS against vectors exported from here.

A "raw window" for an issue hour t (UTC) holds:
  pm:     25 island-mean PM2.5 values, hours t-24..t (last = t)
  blh, ws, wd, precip: 25 values, hours t..t+24 (index = offset from t)
  aq:     {point: 25 values, hours t..t+24} for every point in config.POINTS
  hour_utc: hour of day of t in UTC
"""

import math

FEATURES = [
    ("y0", "recent"),
    ("y1", "recent"),
    ("y3", "recent"),
    ("y24", "recent"),
    ("dy3", "recent"),
    ("hour_sin", "time"),
    ("hour_cos", "time"),
    ("log_blh", "mixing"),
    ("wind_speed", "wind"),
    ("wind_u", "wind"),
    ("wind_v", "wind"),
    ("rain", "rain"),
    ("cams_sg_h", "cams"),
    ("cams_sg_0", "cams"),
    ("sumatra", "upstream"),
    ("batam", "upstream"),
    ("kalimantan", "upstream"),
    ("sumatra_x_sw", "upstream"),
    ("kalimantan_x_e", "upstream"),
]
NAMES = [f for f, _ in FEATURES]

GROUP_LABELS = {
    "time": "Time of day",
    "mixing": "Mixing height (how much the air can disperse)",
    "wind": "Wind",
    "rain": "Rain",
    "cams": "Smoke model over Singapore (CAMS)",
    "upstream": "Smoke over nearby Sumatra, Batam and Kalimantan",
}


def _l(x):
    return math.log1p(max(x, 0.0))


def _mean(xs):
    return sum(xs) / len(xs)


def features(raw, h):
    """Feature vector for horizon h (hours)."""
    pm = raw["pm"]
    y0 = _l(pm[24])
    hour = (raw["hour_utc"] + 8 + h) % 24
    ws = raw["ws"][h]
    wd = math.radians(raw["wd"][h])
    u = -ws * math.sin(wd)  # km/h toward the east
    v = -ws * math.cos(wd)  # km/h toward the north
    aq = raw["aq"]
    sumatra = _l(_mean([aq["riau"][0], aq["jambi"][0], aq["palembang"][0]]))
    kal = _l(aq["kalbar"][0])
    return [
        y0,
        _l(pm[23]),
        _l(_mean(pm[22:25])),
        _l(_mean(pm[1:25])),
        y0 - _l(pm[21]),
        math.sin(2 * math.pi * hour / 24),
        math.cos(2 * math.pi * hour / 24),
        math.log(max(raw["blh"][h], 50.0)),
        ws,
        u,
        v,
        math.log1p(sum(raw["precip"][1 : h + 1])),
        _l(aq["sg"][h]),
        _l(aq["sg"][0]),
        sumatra,
        _l(aq["batam"][0]),
        kal,
        sumatra * max(u + v, 0.0) / 14,  # smoke from the south-west, carried by SW winds
        kal * max(-u, 0.0) / 10,  # smoke from the east, carried by easterlies
    ]
