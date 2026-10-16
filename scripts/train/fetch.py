"""Download and cache raw history: NEA hourly PM2.5, Open-Meteo weather (ERA5) and air quality.

Run: uv run --project scripts/train python scripts/train/fetch.py [--nea-only]
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

from config import POINTS, START

CACHE = Path(__file__).parent / ".cache"
UA = {"User-Agent": "haze-tracker-bot-training/0.1"}
# Optional data.gov.sg API key (raises the ~12 requests/min anonymous limit). Read from the
# environment only — never hard-code or commit it.
GOVSG_KEY = os.environ.get("DATAGOVSG_API_KEY", "").strip()


def get_json(url: str, tries: int = 6):
    headers = dict(UA)
    if GOVSG_KEY and "data.gov.sg" in url:
        headers["x-api-key"] = GOVSG_KEY
    attempt = 0
    while attempt < tries:
        attempt += 1
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:  # data.gov.sg: no data for that day
                return {}
            if e.code == 429:  # anonymous data.gov.sg quota: wait it out, don't give up
                wait = int(e.headers.get("Retry-After") or 30)
                print(f"  HTTP 429, waiting {wait}s", flush=True)
                time.sleep(wait)
                attempt -= 1  # quota waits don't use up retries
                continue
            if attempt == tries:
                raise
            wait = 2**attempt
            print(f"  HTTP {e.code}, retry in {wait}s")
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001 — retry anything transient
            if attempt == tries:
                raise
            wait = 2**attempt
            print(f"  retry {attempt} in {wait}s: {e}")
            time.sleep(wait)


def nea_day(d: date):
    path = CACHE / "nea" / f"{d.isoformat()}.json"
    if path.exists() and d < date.today() - timedelta(days=1):
        return
    body = get_json(f"https://api-open.data.gov.sg/v2/real-time/api/pm25?date={d.isoformat()}")
    items = [
        {"t": i["timestamp"], "pm25": i["readings"]["pm25_one_hourly"]}
        for i in (body.get("data") or {}).get("items", [])
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items))
    time.sleep(0.1 if GOVSG_KEY else 0.5)  # be gentle with data.gov.sg


def fetch_nea():
    start = date.fromisoformat(START) - timedelta(days=2)
    days = [start + timedelta(days=i) for i in range((date.today() - start).days + 1)]
    # The anonymous quota is ~12 requests/min, so fetch what matters most first:
    # this year, then the Sep–Nov haze seasons, then everything else.
    days.sort(key=lambda d: (0 if d.year == date.today().year else 1 if d.month in (9, 10, 11) else 2, -d.toordinal()))
    days = [d for d in days if not (CACHE / "nea" / f"{d.isoformat()}.json").exists() or d >= date.today() - timedelta(days=1)]
    print(f"NEA: {len(days)} days to fetch")
    print("  using data.gov.sg API key" if GOVSG_KEY else "  no API key: anonymous rate limit (~12/min)")
    with ThreadPoolExecutor(max_workers=4 if GOVSG_KEY else 1) as pool:
        for i, _ in enumerate(pool.map(nea_day, days)):
            if i % 100 == 0:
                print(f"  {i}/{len(days)}")


def fetch_weather():
    lat, lon = POINTS["sg"]
    end = date.today().isoformat()
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}&start_date={START}&end_date={end}"
        "&hourly=boundary_layer_height,wind_speed_10m,wind_direction_10m,precipitation,relative_humidity_2m"
    )
    print("Open-Meteo weather (ERA5)")
    (CACHE / "weather.json").write_text(json.dumps(get_json(url)))


def fetch_aq():
    names = list(POINTS)
    lats = ",".join(str(POINTS[n][0]) for n in names)
    lons = ",".join(str(POINTS[n][1]) for n in names)
    end = date.today().isoformat()
    url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={lats}&longitude={lons}&start_date={START}&end_date={end}&hourly=pm2_5"
    )
    print("Open-Meteo air quality")
    body = get_json(url)
    (CACHE / "aq.json").write_text(json.dumps(dict(zip(names, body if isinstance(body, list) else [body]))))


if __name__ == "__main__":
    CACHE.mkdir(exist_ok=True)
    if "--nea-only" not in sys.argv:
        fetch_weather()
        fetch_aq()
    fetch_nea()
    print("done")
