"""Check the two-band vector texture's wind direction against the source COGs.

The viewer draws wind by integrating u and v out of `vector-preview.png`
(core's #593). Nothing in the browser can tell a correct direction from one
rotated or mirrored by an encoding mistake, so the convention is checked
against the data instead: for each model this samples a few points, reads u and
v straight from the COGs with rasterio, decodes the same points out of the
texture exactly as WeatherLayers' shader does, and compares both the components
and the meteorological bearing they imply.

Run it inside the tile server, which can reach both the COGs and its own route:

    docker compose cp dev-plugins/georiva-forecast-viewer/docs/wind_direction_check.py \\
        georiva-titiler-app:/tmp/check.py
    docker compose exec -T georiva-titiler-app python -I /tmp/check.py

It exits non-zero on any mismatch. The sample points, times and runs below are
the ones `docs/wind-direction-check.md` records a result for; edit them to
re-run against whatever data a stack happens to hold.
"""

import sys
from datetime import UTC, datetime

import httpx
import numpy as np
from rasterio.io import MemoryFile

sys.path.insert(0, "/app")

from app.dependencies import build_cog_url
from app.reader import ResilientReader

ORG = "central"

#: (label, catalog, collection, u, v, valid time, reference time, sample lon/lats)
MODELS = [
    (
        "IFS",
        "ecmwf-ifs",
        "ecmwf-ifs-surface",
        "10u",
        "10v",
        "2026-11-04T18:00:00Z",
        "2026-11-03T12:00:00Z",
        [(36.8, -1.3), (3.4, 6.5), (18.4, -33.9), (-60.0, 0.0), (140.0, -35.0)],
    ),
    (
        "WRF",
        "kmd-nwp",
        "kmd-nwp-surface",
        "u10",
        "v10",
        "2026-11-04T17:00:00Z",
        "2026-11-04T03:00:00Z",
        [(36.8, -1.3), (39.6, -4.0), (34.7, 0.5)],
    ),
]


def iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def bearing(u: float, v: float) -> float:
    """The direction the wind blows *from*, in degrees clockwise from north."""
    return (270.0 - np.degrees(np.arctan2(v, u))) % 360.0


def cog_value(path: str, lon: float, lat: float) -> float:
    """The source value at lon/lat, read straight from the COG."""
    with ResilientReader(path) as src:
        point = src.point(lon, lat)
    return float(np.ma.filled(point.array, np.nan)[0])


def decode(png: bytes, bounds, unscale, lon: float, lat: float):
    """The texture's pixel at lon/lat, unscaled the way WeatherLayers unscales it.

    R and G carry u and v over one shared range, so the decode is
    ``mix(low, high, channel / 255)`` per band — the same expression the
    layer's shader applies — and alpha below 255 means no value here.
    """
    with MemoryFile(png) as memfile, memfile.open() as src:
        bands = src.read()
    west, south, east, north = bounds
    _, height, width = bands.shape
    col = min(max(int((lon - west) / (east - west) * width), 0), width - 1)
    row = min(max(int((north - lat) / (north - south) * height), 0), height - 1)
    low, high = unscale
    alpha = int(bands[3, row, col]) if bands.shape[0] > 3 else 255
    u = low + (high - low) * bands[0, row, col] / 255.0
    v = low + (high - low) * bands[1, row, col] / 255.0
    return u, v, alpha


def check_model(label, catalog, collection, u_name, v_name, time, reftime, points) -> int:
    time_dt, reftime_dt = iso(time), iso(reftime)
    url = (
        f"http://localhost:8000/{ORG}/{catalog}/{collection}/vector-preview.png"
        f"?u_variable={u_name}&v_variable={v_name}&time={time}&reftime={reftime}"
    )
    response = httpx.get(url, timeout=180.0)
    if response.status_code != 200:
        print(f"{label}: {response.status_code} {response.text[:300]}")
        return 1

    bounds = [float(x) for x in response.headers["X-Image-Bounds"].split(",")]
    unscale = [float(x) for x in response.headers["X-Image-Unscale"].split(",")]
    step = (unscale[1] - unscale[0]) / 255
    print(f"\n=== {label} {collection} {u_name}/{v_name} {time} (ref {reftime}) ===")
    print(f"X-Image-Bounds  {bounds}")
    print(f"X-Image-Unscale {unscale}   one level = {step:.4f} m/s")

    cogs = {name: build_cog_url(ORG, catalog, collection, name, time_dt, reftime_dt) for name in (u_name, v_name)}
    header = f"{'lon':>8} {'lat':>7} | {'u src':>8} {'u tex':>8} | {'v src':>8} {'v tex':>8} | "
    print(header + f"{'from src':>9} {'from tex':>9} | alpha")

    failures = 0
    for lon, lat in points:
        u_src = cog_value(cogs[u_name], lon, lat)
        v_src = cog_value(cogs[v_name], lon, lat)
        u_tex, v_tex, alpha = decode(response.content, bounds, unscale, lon, lat)
        inside = bounds[0] <= lon <= bounds[2] and bounds[1] <= lat <= bounds[3]
        # One quantisation step plus a half for the sampling difference between
        # the COG's native grid and the preview's.
        ok = abs(u_src - u_tex) <= step * 1.5 and abs(v_src - v_tex) <= step * 1.5 if inside and alpha == 255 else True
        failures += 0 if ok else 1
        print(
            f"{lon:8.2f} {lat:7.2f} | {u_src:8.3f} {u_tex:8.3f} | {v_src:8.3f} {v_tex:8.3f} | "
            f"{bearing(u_src, v_src):9.1f} {bearing(u_tex, v_tex):9.1f} | {alpha}"
            f"{'' if ok else '   <-- MISMATCH'}"
        )
    return failures


def main() -> int:
    failures = sum(check_model(*model) for model in MODELS)
    print("\nmismatches:", failures)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
