<script setup lang="ts">
import { onMounted, ref } from "vue";
import DayStrip from "./components/DayStrip.vue";
import Legend from "./components/Legend.vue";
import MapView from "./components/MapView.vue";
import ModelPanel from "./components/ModelPanel.vue";
import Rail from "./components/Rail.vue";
import { useViewer } from "./state/store";

const viewer = useViewer();
const textureReady = ref(false);
const textureError = ref<string | null>(null);

onMounted(viewer.load);
</script>

<template>
  <div class="app">
    <MapView
      v-if="viewer.state.catalogue"
      :config="viewer.state.catalogue.config"
      @texture-ready="textureReady = $event"
      @texture-error="textureError = $event"
    />
    <div v-if="viewer.state.status === 'loading'" class="notice">Loading…</div>
    <div v-else-if="viewer.state.status === 'error'" class="notice notice--error">{{ viewer.state.error }}</div>
    <div v-else-if="viewer.state.status === 'empty'" class="notice">Nothing is configured for this viewer yet.</div>
    <template v-else>
      <Rail />
      <div v-if="viewer.state.sourceError || textureError" class="notice notice--error notice--floating">
        {{ viewer.state.sourceError ? `This model could not be loaded: ${viewer.state.sourceError}` : "" }}
        {{ textureError ? `Texture failed: ${textureError}` : "" }}
      </div>
      <ModelPanel />
      <Legend />
      <footer class="bottom">
        <DayStrip :texture-ready="textureReady" />
      </footer>
    </template>
  </div>
</template>
