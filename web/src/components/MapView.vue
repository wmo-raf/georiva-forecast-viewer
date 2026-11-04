<script setup lang="ts">
/**
 * The map: a MapLibre basemap under the fixed pair the viewer draws — the
 * selected scalar quantity as a WeatherLayers raster, and the same model's
 * 10 m wind as animated particles.
 *
 * Both come from value-encoded textures derived per request (core's ADR 0021),
 * one band for the scalar and two for the wind pair (core's #593). Values, not
 * colours: the palette from EDR is applied on the GPU, so a palette change
 * repaints rather than refetches, and the wind's u and v survive the trip as
 * numbers the particle layer can integrate.
 *
 * Each texture has its own slot, loaded independently and holding the last
 * frame that arrived. A step is "ready" only once both have settled, so
 * playback never runs ahead of the wind; a failed load leaves the frame on
 * screen rather than blanking the map.
 */
import { MapboxOverlay } from "@deck.gl/mapbox";
// MapLibre 5, not 6: deck.gl's interleaved overlay reads the map's transform,
// which 6 no longer exposes, so the raster layer would never draw.
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import { ImageType, ParticleLayer, RasterLayer } from "weatherlayers-gl";
import type { ViewerConfig } from "../api/types";
import { particleCount, type Bounds } from "../map/particles";
import { loadTexture, type Texture } from "../map/texture";
import { useViewer } from "../state/store";

/** A muted dark basemap so the data colours carry the picture; the settings model can replace it. */
const DEFAULT_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LAYER_ID = "forecast-raster";
const WIND_LAYER_ID = "forecast-wind";

/**
 * How the trails look: white over the raster, long enough to read a direction
 * at a glance without hiding the colours underneath. `speedFactor` is applied
 * relative to the zoom, so one value reads the same whether the view is a
 * continent or a country. Tuned by eye against both models.
 */
const WIND = {
  color: [255, 255, 255, 230] as [number, number, number, number],
  width: 1.4,
  maxAge: 25,
  speedFactor: 25,
  opacity: 0.85,
};

const props = defineProps<{ config: ViewerConfig }>();
const emit = defineEmits<{
  /** Both textures of the current step have settled — the frame is as drawn as it will get. */
  frameReady: [ready: boolean];
  rasterError: [message: string | null];
  windError: [message: string | null];
}>();

const viewer = useViewer();
const container = ref<HTMLDivElement | null>(null);
/** The view the particle budget is sized against; null until the map has laid out. */
const viewport = ref<Bounds | null>(null);
let map: maplibregl.Map | null = null;
let overlay: MapboxOverlay | null = null;
let labelsLayerId: string | undefined;

/** One texture under one URL: what is drawn, whether a newer frame is in flight, and the last failure. */
interface Slot {
  texture: Ref<Texture | null>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
}

function newSlot(): Slot {
  return { texture: shallowRef(null), pending: ref(false), error: ref(null) };
}

const raster = newSlot();
const wind = newSlot();

function windLayers() {
  const current = wind.texture.value;
  if (!current) return [];
  return [
    new ParticleLayer({
      id: WIND_LAYER_ID,
      beforeId: labelsLayerId,
      image: current.image,
      // The texture's own extent, which is the WRF domain for a regional model
      // and the world for IFS: the layer freezes every particle outside it.
      bounds: current.bounds,
      imageType: ImageType.VECTOR,
      // One range for both bands, as the pair was encoded over (core's #593):
      // R unscales to u and G to v, so the integrated direction is the source's.
      imageUnscale: current.unscale,
      numParticles: particleCount(current.bounds, viewport.value),
      maxAge: WIND.maxAge,
      speedFactor: WIND.speedFactor,
      width: WIND.width,
      color: WIND.color,
      opacity: WIND.opacity,
      animate: true,
    }),
  ];
}

function layers() {
  const current = raster.texture.value;
  const palette = viewer.parameter.value?.["x-georiva"].palette;
  if (!current || !palette) return windLayers();
  return [
    new RasterLayer({
      id: LAYER_ID,
      beforeId: labelsLayerId,
      image: current.image,
      bounds: current.bounds,
      imageUnscale: current.unscale,
      imageSmoothing: 0,
      palette,
      opacity: 0.85,
      pickable: false,
    }),
    ...windLayers(),
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
function follow(url: ComputedRef<string | null>, into: Slot) {
  watch(
    url,
    async (next) => {
      if (!next) {
        into.texture.value = null;
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

follow(viewer.textureUrl, raster);
follow(viewer.windTextureUrl, wind);

const ready = computed(() => !raster.pending.value && !wind.pending.value);
watch(ready, (value) => emit("frameReady", value), { immediate: true });
watch(raster.error, (message) => emit("rasterError", message), { immediate: true });
watch(wind.error, (message) => emit("windError", message), { immediate: true });

watch(() => viewer.parameter.value, repaint);

function readViewport() {
  if (!map) return;
  const bounds = map.getBounds();
  viewport.value = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

onMounted(() => {
  if (!container.value) return;
  map = new maplibregl.Map({
    container: container.value,
    style: props.config.basemap_style ?? DEFAULT_STYLE,
    center: props.config.default_view.center,
    zoom: props.config.default_view.zoom,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  // On `moveend`, not `move`: the budget only moves in powers of two, and
  // resizing it mid-gesture would restart every trail (see `map/particles.ts`).
  map.on("moveend", () => {
    readViewport();
    repaint();
  });
  map.once("load", () => {
    const style = map!.getStyle() as StyleSpecification;
    labelsLayerId = style.layers.find((l) => l.type === "symbol")?.id;
    readViewport();
    overlay = new MapboxOverlay({ interleaved: true, layers: layers() });
    map!.addControl(overlay);
  });
});

onBeforeUnmount(() => {
  map?.remove();
  map = null;
  overlay = null;
});
</script>

<template>
  <div ref="container" class="map"></div>
</template>
