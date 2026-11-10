/**
 * Yr's weather icons, given to MapLibre one at a time as the map asks for them.
 *
 * The SVGs are vendored (`assets/weather-symbols/`, see its `SOURCE.md`) and
 * bundled as URLs, not inlined: a frame shows a few dozen distinct codes out of
 * eighty-odd, so an icon is fetched and rasterised only when a town on screen
 * first needs it — on MapLibre's `styleimagemissing` — at the screen's own
 * pixel ratio, so it stays sharp on any display.
 *
 * A code with no icon (one this set does not have, or a typo upstream) is
 * simply never added: MapLibre draws the town's text without an icon, which
 * keeps its name and numbers on the map.
 */

import type { Map as MapLibreMap } from "maplibre-gl";

/** The prefix that marks a style image as one of these icons. */
export const ICON_PREFIX = "yr:";

/** Drawn size in CSS pixels. */
const ICON_SIZE = 36;

const URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../assets/weather-symbols/*.svg", { eager: true, query: "?url", import: "default" }),
  ).map(([path, url]) => [path.replace(/^.*\/(.+)\.svg$/, "$1"), url]),
);

function rasterise(url: string, pixelRatio: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = Math.round(ICON_SIZE * pixelRatio);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("no 2d context"));
      context.drawImage(image, 0, 0, size, size);
      resolve(context.getImageData(0, 0, size, size));
    };
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}

/**
 * Answer `map`'s requests for weather icons.
 *
 * `relayout` is called after an icon lands: MapLibre does not retry a symbol
 * whose image was missing at layout, so the symbol source has to be set again
 * for the new icon to appear.
 */
export function serveWeatherIcons(map: MapLibreMap, relayout: () => void): void {
  const requested = new Set<string>();
  map.on("styleimagemissing", (event) => {
    const id = event.id;
    if (!id.startsWith(ICON_PREFIX) || requested.has(id)) return;
    requested.add(id);
    const url = URLS[id.slice(ICON_PREFIX.length)];
    if (!url) return;
    const pixelRatio = window.devicePixelRatio || 1;
    rasterise(url, pixelRatio)
      .then((data) => {
        if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio });
        relayout();
      })
      .catch(() => {
        // Left out: the town keeps its text.
      });
  });
}
