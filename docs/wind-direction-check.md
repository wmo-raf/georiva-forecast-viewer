# Wind direction, checked against the source data

The viewer draws wind as particles integrated from a two-band texture
(`vector-preview.png`, core's #593): R unscales to u, G to v, over one range
shared by both bands. Nothing on screen distinguishes a correct field from one
mirrored, transposed or rotated by 90° — a plausible-looking flow is the
failure mode — so the convention is checked against the data rather than by
eye. Issue wmo-raf/georiva-forecast-viewer#3 asks for that check and for this
note.

`docs/wind_direction_check.py` is the check. It samples points, reads u and v
straight from the COGs with rasterio, decodes the same points out of the
texture with the expression WeatherLayers' shader uses — `mix(low, high,
channel / 255)` per band — and compares the components and the meteorological
bearing. It exits non-zero on any mismatch; the header comment says how to run
it.

## Result, 2026-11-04

Both models agree with their source within one quantisation step, and the
bearings agree. No band is swapped and no axis is flipped.

### ECMWF IFS, `ecmwf-ifs-surface` `10u`/`10v`

Valid 2026-11-04T18:00Z from the 2026-11-03T12:00Z run. Bounds
`[-180, -90, 179.875, 90]`; unscale `[-80, 80]`, one level = 0.6275 m/s.

| lon | lat | u src | u tex | v src | v tex | from src | from tex |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 36.80 | −1.30 | −1.727 | −2.196 | −1.930 | −2.196 | 41.8 | 45.0 |
| 3.40 | 6.50 | 0.648 | 0.314 | 0.758 | 0.314 | 220.6 | 225.0 |
| 18.40 | −33.90 | 0.273 | −0.314 | 3.039 | 2.824 | 185.1 | 173.7 |
| −60.00 | 0.00 | −0.258 | −0.314 | −1.086 | −1.569 | 13.4 | 11.3 |
| 140.00 | −35.00 | 1.086 | 0.941 | 1.914 | 1.569 | 209.6 | 211.0 |

### KMD WRF, `kmd-nwp-surface` `u10`/`v10`

Valid 2026-11-04T17:00Z from the 2026-11-04T03:00Z run. Bounds
`[33.877, −4.710, 41.901, 5.095]` — the regional domain, not the world;
unscale `[-20, 10]`, one level = 0.1176 m/s.

| lon | lat | u src | u tex | v src | v tex | from src | from tex |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 36.80 | −1.30 | −5.599 | −5.647 | −2.031 | −2.118 | 70.1 | 69.4 |
| 39.60 | −4.00 | −3.728 | −3.765 | 1.389 | 1.294 | 110.4 | 109.0 |
| 34.70 | 0.50 | 0.860 | 0.824 | −2.336 | −2.353 | 339.8 | 340.7 |

This also confirms the WRF side of the convention from the other end: the
conversion script writes earth-relative winds, so u is eastward on the same
axis IFS uses, and no per-model rotation is needed anywhere in the viewer. A
grid-relative source would have shown up here as a consistent angular offset,
largest away from the domain's central meridian.

## What the ranges cost

A texture pixel is 8 bits, so the configured `value_min`/`value_max` of the
components is what direction precision is spent on, and the range is the
operator's to set:

- WRF's `[-20, 10]` quantises to 0.12 m/s. Bearings agree within 1.5°.
- IFS's `[-80, 80]` quantises to 0.63 m/s, which is coarse next to a 10 m wind
  that rarely passes 25 m/s. In the light winds sampled above (1–3 m/s) that
  costs up to 11° of bearing — visible as particles that drift a little off
  the true flow where the air is nearly still, and negligible in strong wind.

This is inherent to encoded textures (core's ADR 0021) and not a bug in either
half: the remedy is an admin edit narrowing `10u`/`10v` to the range 10 m wind
actually occupies, after which the `v=` token changes and every cached texture
is replaced (ADR 0021 again). Nothing in the app or in core needs to change for
it, which is why no issue is filed.
