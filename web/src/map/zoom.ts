/**
 * The toolbar's zoom buttons, which stand in for MapLibre's own control.
 *
 * The map lives inside `MapView` and the buttons in `Toolbar`, so the map is
 * attached here once it exists and the buttons read and drive it through this
 * module. The current zoom is mirrored on every change, so a button greys out
 * at the limit whether the map got there by the button, the wheel or a pinch.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { computed, ref, shallowRef } from "vue";

const map = shallowRef<MapLibreMap | null>(null);
const zoom = ref(0);

function sync() {
  if (map.value) zoom.value = map.value.getZoom();
}

/** Called by `MapView` with its map, and with `null` when it is torn down. */
export function attachMap(next: MapLibreMap | null) {
  map.value?.off("zoom", sync);
  map.value = next;
  next?.on("zoom", sync);
  sync();
}

export function useZoom() {
  return {
    ready: computed(() => map.value !== null),
    canZoomIn: computed(() => !!map.value && zoom.value < map.value.getMaxZoom()),
    canZoomOut: computed(() => !!map.value && zoom.value > map.value.getMinZoom()),
    // Marked as the user's, like a wheel or a pinch: a pending framing gives way to it.
    zoomIn: () => map.value?.zoomIn(undefined, { byUser: true }),
    zoomOut: () => map.value?.zoomOut(undefined, { byUser: true }),
  };
}
