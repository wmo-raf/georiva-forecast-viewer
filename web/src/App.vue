<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DayStrip from "./components/DayStrip.vue";
import Legend from "./components/Legend.vue";
import MapView from "./components/MapView.vue";
import ModelPanel from "./components/ModelPanel.vue";
import Rail from "./components/Rail.vue";
import Toolbar from "./components/Toolbar.vue";
import { useViewer } from "./state/store";

const viewer = useViewer();
const frameReady = ref(false);
const rasterError = ref<string | null>(null);
const windError = ref<string | null>(null);

/** Every failure that leaves the map standing, as one floating notice. */
const warnings = computed(() =>
  [
    viewer.state.sourceError ? `This model could not be loaded: ${viewer.state.sourceError}` : null,
    rasterError.value ? `Texture failed: ${rasterError.value}` : null,
    windError.value ? `Wind failed: ${windError.value}` : null,
  ].filter((message): message is string => message !== null),
);

/**
 * The bar's own height, published as `--fv-bar-total` for anything that has
 * to stand clear of it — today the model panel.
 *
 * It is measured rather than declared because the bar wraps: one row on a
 * desktop, two once the legend goes above it, three once the run pill takes a
 * line of its own, and the last of those is decided by the width available
 * rather than by a breakpoint a media query could match.
 */
const bottomEl = ref<HTMLElement | null>(null);

function publishBarHeight(height: number) {
  document.documentElement.style.setProperty("--fv-bar-total", `${Math.round(height)}px`);
}

const barObserver =
  typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(([entry]) => publishBarHeight(entry.contentRect.height))
    : null;

watch(bottomEl, (element, previous) => {
  if (previous) barObserver?.unobserve(previous);
  if (element) barObserver?.observe(element);
});

onBeforeUnmount(() => barObserver?.disconnect());

onMounted(viewer.load);
</script>

<template>
  <div class="app">
    <MapView
      v-if="viewer.state.catalogue"
      :config="viewer.state.catalogue.config"
      @frame-ready="frameReady = $event"
      @raster-error="rasterError = $event"
      @wind-error="windError = $event"
    />
    <div v-if="viewer.state.status === 'loading'" class="notice">Loading…</div>
    <div v-else-if="viewer.state.status === 'error'" class="notice notice--error">{{ viewer.state.error }}</div>
    <div v-else-if="viewer.state.status === 'empty'" class="notice">Nothing is configured for this viewer yet.</div>
    <template v-else>
      <Rail />
      <div v-if="warnings.length" class="notice notice--error notice--floating">
        <p v-for="message in warnings" :key="message">{{ message }}</p>
      </div>
      <ModelPanel />
      <Toolbar />
      <!-- One row: the time control takes what is left of the width, the
           legend closes it on the right. On a narrow viewport the legend
           moves back above the row; `style.css` does that with `order`. -->
      <footer class="bottom" ref="bottomEl">
        <DayStrip :frame-ready="frameReady" />
        <Legend />
      </footer>
    </template>
  </div>
</template>
