# Weather symbols

Yr's weather symbols, the **shadows** SVG set from NRK's
[`nrkno/yr-weather-symbols`](https://github.com/nrkno/yr-weather-symbols)
(`dist/symbols/shadows/svg/` in the `symbols.zip` published from its `gh-pages`
branch), vendored unchanged at `gh-pages` commit
`53a732bcea2804b60a4e3fad52df3f4176dfe178`.

**Licence: CC BY 4.0** — "Yr weather symbols © 2015 by Yr/NRK"; see `LICENSE`
beside this file. Attribution is required wherever they are shown, which is why
the Weather layer's source carries a credit in the map's attribution control
(`map/basemap.ts`).

Files are named by NRK's id (`03n.svg`), not by the `symbol_code` met.no's
locationforecast — and so Forti — returns (`partlycloudy_night`).
`map/symbolIds.ts` maps one to the other, copied from the same repository's
`src/index.ts` at `master` commit `4e1082d2af114c0c0140c2a0c1ab73043f6ea118`;
its 83 keys are met.no's whole legend.

To update, replace the files and the map from newer commits and change both
hashes above; do not edit them by hand.
