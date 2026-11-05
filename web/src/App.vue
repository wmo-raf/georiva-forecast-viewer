<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import DayStrip from "./components/DayStrip.vue";
import Legend from "./components/Legend.vue";
import MapView from "./components/MapView.vue";
import ModelPanel from "./components/ModelPanel.vue";
import Rail from "./components/Rail.vue";
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
      <footer class="bottom">
        <Legend />
        <DayStrip :frame-ready="frameReady" />
      </footer>
    </template>
  </div>
</template>
