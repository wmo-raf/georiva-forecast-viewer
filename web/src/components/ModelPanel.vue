<script setup lang="ts">
/**
 * "Select model", bottom right: the sources bound to the selected quantity,
 * and inside the same panel the run, because a run belongs to a model and is
 * changed rarely.
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
const runs = computed(() => viewer.state.timeline?.runs ?? []);
const selectedRun = computed(() => viewer.state.timeline?.selected ?? "");

function formatRun(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day} ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
}

function pick(slug: string) {
  viewer.pickSource(slug);
  open.value = false;
}
</script>

<template>
  <div class="model" :class="{ 'model--open': open }">
    <div v-if="open" class="model__panel">
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
      <div class="model__heading" v-if="runs.length">Run</div>
      <select
        v-if="runs.length"
        class="model__run"
        :value="selectedRun"
        aria-label="Run"
        @change="viewer.pickRun(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="r in runs" :key="r.reference_time" :value="r.reference_time">{{ formatRun(r.reference_time) }}</option>
      </select>
      <div v-else-if="viewer.state.timeline" class="model__note">No complete run yet.</div>
    </div>
    <button type="button" class="model__toggle" :aria-expanded="open" @click="open = !open">
      <span class="model__eyebrow">Select model</span>
      <span class="model__current">
        <span class="model__name">{{ viewer.source.value?.name ?? "—" }}</span>
        <span v-if="viewer.source.value?.descriptor" class="model__descriptor">{{ viewer.source.value.descriptor }}</span>
        <ChevronUp class="model__chevron" :size="16" aria-hidden="true" />
      </span>
    </button>
  </div>
</template>
