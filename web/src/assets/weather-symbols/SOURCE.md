# Weather symbols

Yr's weather symbols, the SVG set from met.no's
[`metno/weathericons`](https://github.com/metno/weathericons) (`weather/svg/`),
vendored unchanged at commit `89e3173756248b4696b9b10677b66c4ef435db53`.
MIT licensed; see `LICENSE` beside this file.

Each file is named by the `symbol_code` met.no's locationforecast — and so
Forti — returns (`partlycloudy_night.svg`), which is the whole of the mapping:
`map/weatherIcons.ts` finds an icon by its code and nothing else.

The light set only, to match the viewer's grey basemap. To update, replace the
files from a newer commit and change the hash above; do not edit them by hand.
