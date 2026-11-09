<script setup lang="ts">
/**
 * "Select model", bottom right: the sources bound to the selected quantity.
 * The run lives in the bar, beside the timeline it governs — see `RunPicker`.
 */
import { ChevronUp } from "lucide-vue-next";
import { computed, ref } from "vue";
import { sourcesFor } from "../state/selection";
import { useViewer } from "../state/store";

const viewer = useViewer();
const open = ref(false);

const sources = computed(() =>
  viewer.scalarView.value && viewer.state.selection
    ? sourcesFor(viewer.scalarView.value, viewer.state.selection.quantity)
    : [],
);
function pick(slug: string) {
  viewer.pickSource(slug);
  open.value = false;
}
</script>

<template>
  <div class="model" :class="{ 'model--open': open }" @keydown.escape="open = false">
    <button
      type="button"
      class="model__toggle"
      :aria-expanded="open"
      aria-controls="model-panel"
      :disabled="!viewer.source.value"
      @click="open = !open"
    >
      <span class="model__eyebrow">Select model</span>
      <span class="model__current">
        <span v-if="viewer.source.value" class="model__name">{{ viewer.source.value.name }}</span>
        <!-- Until the catalogue lands: the name's line, at a name's length. -->
        <span v-else class="skel skel--line model__skel" aria-label="Loading models"></span>
        <span v-if="viewer.source.value?.descriptor" class="model__descriptor">{{ viewer.source.value.descriptor }}</span>
        <ChevronUp class="model__chevron" :size="16" aria-hidden="true" />
      </span>
    </button>
    <div v-if="open" id="model-panel" class="model__panel">
      <div class="model__heading">Model</div>
      <button
        v-for="s in sources"
        :key="s.slug"
        type="button"
        class="model__option"
        :class="{ 'model__option--selected': s.slug === viewer.state.selection?.source }"
        @click="pick(s.slug)"
      >
        <span class="model__name">{{ s.name }}</span>
        <span v-if="s.descriptor" class="model__descriptor">{{ s.descriptor }}</span>
      </button>
    </div>
  </div>
</template>
