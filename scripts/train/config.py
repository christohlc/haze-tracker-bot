"""Shared constants. Points and feature definitions must match tgcloud/lib/forecast/*.js."""

START = "2022-09-01"  # Open-Meteo air-quality history begins around here

# Upstream air-quality points (lat, lon). Weather is taken at Singapore only.
POINTS = {
    "sg": (1.35, 103.82),
    "riau": (0.53, 101.45),  # Pekanbaru, Sumatra
    "jambi": (-1.61, 103.61),  # Sumatra
    "palembang": (-2.98, 104.75),  # South Sumatra
    "batam": (1.08, 104.03),
    "kalbar": (-0.03, 109.33),  # Pontianak, West Kalimantan
}

HORIZONS = [1, 2, 3, 6, 24]
QUANTILES = [0.1, 0.5, 0.9]
