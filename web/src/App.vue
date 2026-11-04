<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MapView from "./components/MapView.vue";
import Picker from "./components/Picker.vue";
import Timeline from "./components/Timeline.vue";
import { sourcesFor } from "./state/selection";
import { useViewer } from "./state/store";

const viewer = useViewer();
const textureReady = ref(false);
const textureError = ref<string | null>(null);

const quantities = computed(() =>
  (viewer.state.catalogue?.quantities ?? []).map((q) => ({ value: q.slug, label: q.name })),
);
const sources = computed(() =>
  viewer.state.catalogue && viewer.state.selection
    ? sourcesFor(viewer.state.catalogue, viewer.state.selection.quantity).map((s) => ({
        value: s.slug,
        label: s.name,
      }))
    : [],
);

onMounted(viewer.load);
</script>

<template>
  <div class="app">
    <MapView
      v-if="viewer.state.catalogue && viewer.state.status !== 'error'"
      :config="viewer.state.catalogue.config"
      @texture-ready="textureReady = $event"
      @texture-error="textureError = $event"
    />
    <aside class="panel panel--top-left">
      <h1 class="panel__title">Forecast viewer</h1>
      <p v-if="viewer.state.status === 'loading'" class="panel__note">Loading…</p>
      <p v-else-if="viewer.state.status === 'error'" class="panel__note panel__note--error">
        {{ viewer.state.error }}
      </p>
      <p v-else-if="viewer.state.status === 'empty'" class="panel__note">Nothing is configured for this viewer yet.</p>
      <template v-else-if="viewer.state.selection">
        <Picker
          label="Quantity"
          :options="quantities"
          :selected="viewer.state.selection.quantity"
          @pick="viewer.pickQuantity"
        />
        <Picker label="Source" :options="sources" :selected="viewer.state.selection.source" @pick="viewer.pickSource" />
        <p v-if="viewer.parameter.value" class="panel__note">
          {{ viewer.parameter.value.label }}
          <span v-if="viewer.parameter.value.unit">({{ viewer.parameter.value.unit.symbol }})</span>
        </p>
        <p v-if="textureError" class="panel__note panel__note--error">Texture failed: {{ textureError }}</p>
      </template>
    </aside>
    <footer class="panel panel--bottom" v-if="viewer.state.status === 'ready'">
      <Timeline :texture-ready="textureReady" />
    </footer>
  </div>
</template>
