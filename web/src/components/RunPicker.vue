<script setup lang="ts">
/**
 * The run the map is drawing, at the head of the bar.
 *
 * A choice only when there is one to make: with several complete runs it is a
 * select, with one it is the same pill reading the run's name and nothing
 * more — no chevron, no focus, nothing offering a menu that would be empty.
 * With no complete run it does not render at all; the strip beside it already
 * says so, in the one place.
 */
import { ChevronDown } from "lucide-vue-next";
import { computed } from "vue";
import { formatRun } from "../state/runs";
import { useViewer } from "../state/store";

const viewer = useViewer();

const runs = computed(() => viewer.state.timeline?.runs ?? []);
const selected = computed(() => viewer.state.timeline?.selected ?? "");
const choosable = computed(() => runs.value.length > 1);
</script>

<template>
  <div class="run" v-if="runs.length">
    <span class="run__eyebrow">Run</span>
    <select
      v-if="choosable"
      class="run__select"
      :value="selected"
      aria-label="Run"
      @change="viewer.pickRun(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="r in runs" :key="r.reference_time" :value="r.reference_time">
        {{ formatRun(r.reference_time) }}
      </option>
    </select>
    <span v-else class="run__value">{{ formatRun(selected) }}</span>
    <ChevronDown v-if="choosable" class="run__chevron" :size="14" aria-hidden="true" />
  </div>
</template>
