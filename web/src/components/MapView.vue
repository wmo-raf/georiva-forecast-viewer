<script setup lang="ts">
/**
 * The map: a MapLibre basemap with one WeatherLayers raster layer over the
 * current step's encoded texture. The texture holds values, not colours, so
 * the palette from EDR is applied on the GPU and the layer is repainted, not
 * refetched, when only the palette changes. The old frame stays on screen
 * until the next has loaded, so stepping never flashes empty.
 */
import { MapboxOverlay } from "@deck.gl/mapbox";
// MapLibre 5, not 6: deck.gl's interleaved overlay reads the map's transform,
// which 6 no longer exposes, so the raster layer would never draw.
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { RasterLayer } from "weatherlayers-gl";
import type { ViewerConfig } from "../api/types";
import { loadTexture, type Texture } from "../map/texture";
import { useViewer } from "../state/store";

/** A muted dark basemap so the data colours carry the picture; the settings model can replace it. */
const DEFAULT_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LAYER_ID = "forecast-raster";

const props = defineProps<{ config: ViewerConfig }>();
const emit = defineEmits<{ textureReady: [ready: boolean]; textureError: [message: string | null] }>();

const viewer = useViewer();
const container = ref<HTMLDivElement | null>(null);
const texture = shallowRef<Texture | null>(null);
let map: maplibregl.Map | null = null;
let overlay: MapboxOverlay | null = null;
let labelsLayerId: string | undefined;

function layers() {
  const current = texture.value;
  const palette = viewer.parameter.value?.["x-georiva"].palette;
  if (!current || !palette) return [];
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
  ];
}

function repaint() {
  overlay?.setProps({ layers: layers() });
}

// A later step supersedes an earlier load in flight: the URL is compared
// after the await, and a stale answer is dropped rather than drawn.
watch(
  viewer.textureUrl,
  async (url) => {
    if (!url) {
      texture.value = null;
      repaint();
      emit("textureError", null);
      emit("textureReady", true);
      return;
    }
    emit("textureReady", false);
    try {
      const loaded = await loadTexture(url);
      if (viewer.textureUrl.value !== url) return;
      texture.value = loaded;
      emit("textureError", null);
      repaint();
      emit("textureReady", true);
    } catch (error) {
      if (viewer.textureUrl.value !== url) return;
      emit("textureError", String(error));
      emit("textureReady", true);
    }
  },
  { immediate: true },
);

watch(() => viewer.parameter.value, repaint);

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
  map.once("load", () => {
    const style = map!.getStyle() as StyleSpecification;
    labelsLayerId = style.layers.find((l) => l.type === "symbol")?.id;
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
