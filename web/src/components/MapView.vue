<script setup lang="ts">
/**
 * The map: a MapLibre basemap under what the viewer draws — the selected
 * scalar quantity as a WeatherLayers raster, the same model's 10 m wind as
 * animated particles and, when the user switches it on, its mean sea level
 * pressure as isobars and highs/lows (one texture for both).
 *
 * The basemap is the viewer's own, bundled rather than fetched (`map/basemap.ts`):
 * one dark grey ground, no variants, no operator override. Both deck layers
 * insert before its `georiva-data-anchor`, so the data draws above the ground
 * and below the shore's shadow, the borders and the names. All carry the same
 * `beforeId` and so share one layer group: deck inserts them at a single point
 * in the style, in array order — raster, isobars, trails, H/L labels — and
 * nothing in the basemap can be placed between them.
 *
 * Both come from value-encoded textures derived per request (core's ADR 0021),
 * one band for the scalar and two for the wind pair (core's #593). Values, not
 * colours: the palette from EDR is applied on the GPU, so a palette change
 * repaints rather than refetches, and the wind's u and v survive the trip as
 * numbers the particle layer can integrate.
 *
 * Each texture has its own slot, loaded independently and holding the last
 * frame that arrived. A step is "ready" only once all have settled, so
 * playback never runs ahead of the wind or the isobars; a failed load leaves
 * the frame on screen rather than blanking the map.
 *
 * A frame is painted through its own parameter, not the selection's
 * (`state/drawn.ts`): a quantity switch within one model keeps the old frame
 * up, in its own colours and under its own legend, until the new texture
 * lands, and then both change at once. A switch to another model clears the
 * map instead — its run, its times and its grid are not the old frame's.
 * A thin bar along the top edge says a frame is on its way, once the wait is
 * long enough to notice.
 *
 * The scalar's slot also feeds the names: every city and town on screen
 * carries the value under it (`map/places.ts`), read off the texture already
 * drawn, so a value costs no request. They are refilled when the frame
 * changes, when the view settles and when basemap tiles arrive, and carry a
 * value only while the texture on screen is the selected source's variable —
 * a quantity switch keeps the old frame up until the new one lands, and its
 * numbers must not sit under the new legend meanwhile.
 */
import { MapLibreOverlay } from "@deck.gl/maplibre";
// MapLibre 6 is ESM-only and has no default export, so the namespace import.
// `setWorkerUrl` is the one-time call every bundler needs: the ESM build loads
// its worker from a real URL, which `import.meta.url` cannot resolve inside
// Vite's module graph.
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl, type FilterSpecification, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import { ContourLayer, HighLowLayer, ImageType, ParticleLayer, RasterLayer } from "weatherlayers-gl";
import type { ViewerConfig } from "../api/types";
import type { Frame } from "../state/drawn";
import { delayed } from "../ui/delayed";
import { DATA_ANCHOR_ID, PLACES_SOURCE_ID, greyBasemap } from "../map/basemap";
import { highLowRadiusKm, pressureLabel } from "../map/highlow";
import { particleCount, type Bounds } from "../map/particles";
import { placesWithValues, VALUED_CLASSES } from "../map/places";
import { readValue } from "../map/sample";
import { loadTexture, type Texture } from "../map/texture";
import { attachMap } from "../map/zoom";
import { useViewer } from "../state/store";

setWorkerUrl(workerUrl);

const LAYER_ID = "forecast-raster";
const WIND_LAYER_ID = "forecast-wind";
const ISOBAR_LAYER_ID = "forecast-isobars";
const HIGH_LOW_LAYER_ID = "forecast-high-low";

/**
 * How the trails look where the user has no say: white over the raster, so a
 * direction reads at a glance without hiding the colours underneath. Speed,
 * width, life and density are the user's, from the toolbar's wind dropup
 * (`state/windSettings.ts`); `speedFactor` is applied relative to the zoom, so
 * one value reads the same whether the view is a continent or a country.
 */
const WIND = {
  color: [255, 255, 255, 230] as [number, number, number, number],
  opacity: 0.85,
};

/**
 * Isobars in dark charcoal, so they never read as the white wind trails and
 * hold up over warm and cool palettes alike. Every fifth line is major; the
 * interval itself is the operator's, per source.
 *
 * `width` and the alpha are the *major* line's: the layer's shader draws every
 * minor line at half the width and half the alpha, and fades both edges. So a
 * major line here is 3 px at 90 % and a minor one 1.5 px at 45 %. Anything
 * lighter loses the minor lines among the wind trails: 1 px at 60 % and 2 px
 * at 80 % were both tried against IFS over Africa, and neither showed the
 * 1016 hPa line running between a 1020 high and a 1012 low.
 */
const ISOBARS = {
  color: [25, 25, 25, 230] as [number, number, number, number],
  width: 3,
  majorEvery: 5,
};

const props = defineProps<{ config: ViewerConfig }>();
const emit = defineEmits<{
  /** Both textures of the current step have settled — the frame is as drawn as it will get. */
  frameReady: [ready: boolean];
  rasterError: [message: string | null];
  windError: [message: string | null];
  pressureError: [message: string | null];
}>();

const viewer = useViewer();
const container = ref<HTMLDivElement | null>(null);
/** The view the particle budget is sized against; null until the map has laid out. */
const viewport = ref<Bounds | null>(null);
let map: maplibregl.Map | null = null;
let overlay: MapLibreOverlay | null = null;

/**
 * One texture under one URL: what is drawn, what it is a frame *of*, whether a
 * newer frame is in flight, and the last failure.
 */
interface Slot {
  texture: Ref<Texture | null>;
  /** What the drawn texture is a frame of, as `follow` was told when it landed. */
  shows: Ref<Frame | null>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
}

function newSlot(shows: Ref<Frame | null> = shallowRef(null)): Slot {
  return { texture: shallowRef(null), shows, pending: ref(false), error: ref(null) };
}

// The raster's frame is the store's, so the legend reads the same one.
const raster = newSlot(viewer.frame);
const wind = newSlot();
/** The pressure variable's texture, which both isobars and highs/lows draw from. */
const pressure = newSlot();

function windLayers() {
  const current = wind.texture.value;
  if (!current) return [];
  const settings = viewer.state.wind;
  return [
    new ParticleLayer({
      id: WIND_LAYER_ID,
      beforeId: DATA_ANCHOR_ID,
      image: current.image,
      // The texture's own extent, which is the WRF domain for a regional model
      // and the world for IFS: the layer freezes every particle outside it.
      bounds: current.bounds,
      imageType: ImageType.VECTOR,
      // One range for both bands, as the pair was encoded over (core's #593):
      // R unscales to u and G to v, so the integrated direction is the source's.
      imageUnscale: current.unscale,
      numParticles: particleCount(current.bounds, viewport.value, settings.density),
      maxAge: settings.life,
      speedFactor: settings.speed,
      width: settings.width,
      color: WIND.color,
      opacity: WIND.opacity,
      animate: true,
    }),
  ];
}

/**
 * The pressure overlay, split around the wind: isobars go under the trails,
 * so lines and particles do not tangle, and the H/L labels go over them, so
 * no trail hides a centre. A slot whose overlay is no longer the selected
 * source's is drawn from until the next texture lands, like the others.
 */
function pressureLayers() {
  const current = pressure.texture.value;
  const overlay = viewer.pressureToDraw.value;
  if (!current || !overlay) return { isobars: [], highLow: [] };
  const settings = viewer.state.pressure;
  const common = {
    beforeId: DATA_ANCHOR_ID,
    image: current.image,
    bounds: current.bounds,
    imageUnscale: current.unscale,
    pickable: false,
  };
  return {
    isobars: settings.isobars
      ? [
          new ContourLayer({
            ...common,
            id: ISOBAR_LAYER_ID,
            interval: overlay.interval,
            majorInterval: overlay.interval * ISOBARS.majorEvery,
            color: ISOBARS.color,
            width: ISOBARS.width,
          }),
        ]
      : [],
    highLow: settings.highLow
      ? [
          new HighLowLayer({
            ...common,
            id: HIGH_LOW_LAYER_ID,
            radius: highLowRadiusKm(current.bounds),
            textFormatFunction: (value: number) => pressureLabel(value, overlay.to_hpa),
          }),
        ]
      : [],
  };
}

function layers() {
  const current = raster.texture.value;
  const palette = viewer.shownParameter.value?.["x-georiva"].palette;
  const { isobars, highLow } = pressureLayers();
  if (!current || !palette) return [...isobars, ...windLayers(), ...highLow];
  return [
    new RasterLayer({
      id: LAYER_ID,
      beforeId: DATA_ANCHOR_ID,
      image: current.image,
      bounds: current.bounds,
      imageUnscale: current.unscale,
      imageSmoothing: 0,
      palette,
      opacity: 0.85,
      pickable: false,
    }),
    ...isobars,
    ...windLayers(),
    ...highLow,
  ];
}

function repaint() {
  overlay?.setProps({ layers: layers() });
}

/**
 * Keep `into` on whatever `url` currently names.
 *
 * A later step supersedes an earlier load in flight: the URL is compared after
 * the await, and a stale answer — or a stale failure — is dropped rather than
 * drawn. An empty URL clears the slot, which is how the wind toggle and a
 * model without a wind binding both take the particles off the map.
 */
function follow(url: ComputedRef<string | null>, into: Slot, shows: () => Frame | null = () => null) {
  watch(
    url,
    async (next) => {
      if (!next) {
        into.texture.value = null;
        into.shows.value = null;
        into.error.value = null;
        into.pending.value = false;
        repaint();
        return;
      }
      into.pending.value = true;
      try {
        const loaded = await loadTexture(next);
        if (url.value !== next) return;
        into.texture.value = loaded;
        // Read on landing: the URL is unchanged, so the selection still names
        // this texture's variable, and its parameter is the one it is drawn with.
        into.shows.value = shows();
        into.error.value = null;
      } catch (error) {
        if (url.value !== next) return;
        into.error.value = String(error);
      }
      into.pending.value = false;
      repaint();
    },
    { immediate: true },
  );
}

const selectedScalar = viewer.selectedScalar;

follow(viewer.textureUrl, raster, () =>
  selectedScalar.value ? { of: selectedScalar.value, parameter: viewer.parameter.value } : null,
);
follow(viewer.windTextureUrl, wind);
follow(viewer.pressureTextureUrl, pressure);

// Pressure is gated like wind: while it is switched on, playback waits for the
// isobars, so they are never a step behind the field under them. Switched off,
// its URL is null and the slot is never pending.
const ready = computed(() => !raster.pending.value && !wind.pending.value && !pressure.pending.value);
watch(ready, (value) => emit("frameReady", value), { immediate: true });
watch(raster.error, (message) => emit("rasterError", message), { immediate: true });
watch(wind.error, (message) => emit("windError", message), { immediate: true });
watch(pressure.error, (message) => emit("pressureError", message), { immediate: true });

/**
 * A frame is on its way: a texture in flight, or — on a switch to another
 * model — the runs and description that must land before its URL exists, a
 * wait `ready` cannot see since no texture is pending yet.
 */
const busy = computed(() => !ready.value || viewer.loading.value);
const showBusy = delayed(busy, 300);

watch(() => viewer.shownParameter.value, repaint);
// Turning pressure on from off reaches the map through its texture's URL; a
// switch between isobars and H/L with the texture already here only restyles it.
watch(() => [viewer.state.pressure.isobars, viewer.state.pressure.highLow], repaint);
// `on` reaches the map through the wind texture's URL; the rest only restyle it.
watch(
  () => [viewer.state.wind.speed, viewer.state.wind.width, viewer.state.wind.life, viewer.state.wind.density],
  repaint,
);

/** The place classes the label layers draw, as a filter on the basemap's own tiles. */
const VALUED_PLACES = ["match", ["get", "class"], VALUED_CLASSES, true, false] as FilterSpecification;

let placesQueued = false;

/**
 * Refill the names from the place features loaded now and the frame on screen.
 *
 * At most once per animation frame: tile arrivals come in bursts, and a burst
 * is one refill. The places are whatever tiles are loaded, so a pan fills in as
 * its tiles arrive rather than waiting for the gesture to end.
 */
function refreshPlaces() {
  if (placesQueued || !map) return;
  placesQueued = true;
  requestAnimationFrame(() => {
    placesQueued = false;
    const target = map?.getSource<GeoJSONSource>(PLACES_SOURCE_ID);
    if (!map || !target) return;
    const features = map.querySourceFeatures("openmaptiles", { sourceLayer: "place", filter: VALUED_PLACES });
    const texture = raster.texture.value;
    const current = texture && raster.shows.value?.of === selectedScalar.value ? texture : null;
    const valueAt = current ? (lon: number, lat: number) => readValue(current, lon, lat) : () => null;
    target.setData(placesWithValues(features, valueAt, viewer.quantity.value?.decimals ?? 0));
  });
}

watch([raster.texture, raster.shows, selectedScalar, () => viewer.quantity.value?.decimals], refreshPlaces);

function readViewport() {
  if (!map) return;
  const bounds = map.getBounds();
  viewport.value = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

onMounted(() => {
  if (!container.value) return;
  map = new maplibregl.Map({
    container: container.value,
    // The shadow is in the style only if this organisation switched it on and
    // the server it came from has the tiles; the catalogue answers both as one.
    style: greyBasemap({ shoreShadow: props.config.shore_shadow }),
    center: props.config.default_view.center,
    zoom: props.config.default_view.zoom,
    attributionControl: { compact: true },
  });
  // No NavigationControl: zoom lives in the toolbar, which drives this map
  // through `map/zoom.ts`.
  attachMap(map);  // On `moveend`, not `move`: the budget only moves in powers of two, and
  // resizing it mid-gesture would restart every trail (see `map/particles.ts`).
  map.on("moveend", () => {
    readViewport();
    repaint();
    refreshPlaces();
  });
  map.on("sourcedata", (event) => {
    if (event.sourceId === "openmaptiles" && event.isSourceLoaded) refreshPlaces();
  });
  map.once("load", () => {
    readViewport();
    overlay = new MapLibreOverlay({ interleaved: true, layers: layers() });
    map!.addControl(overlay);
    refreshPlaces();
  });
});

onBeforeUnmount(() => {
  attachMap(null);
  raster.shows.value = null;
  map?.remove();
  map = null;
  overlay = null;
});
</script>

<template>
  <div ref="container" class="map"></div>
  <div v-if="showBusy" class="map-busy" role="progressbar" aria-label="Loading the map"></div>
</template>
