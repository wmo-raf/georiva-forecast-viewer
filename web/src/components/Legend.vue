<script setup lang="ts">
/** The palette of the drawn quantity as a bar, with a few stop values and the unit. */
import { computed } from "vue";
import { useViewer } from "../state/store";

const viewer = useViewer();

const palette = computed(() => viewer.parameter.value?.["x-georiva"].palette ?? null);
const unit = computed(() => viewer.parameter.value?.unit?.symbol ?? "");

const range = computed(() => {
  const stops = palette.value;
  if (!stops || stops.length === 0) return null;
  return { min: stops[0][0], max: stops[stops.length - 1][0] };
});

const gradient = computed(() => {
  const stops = palette.value;
  const r = range.value;
  if (!stops || !r || r.max === r.min) return "";
  const parts = stops.map(([value, [red, green, blue, alpha]]) => {
    const pct = ((value - r.min) / (r.max - r.min)) * 100;
    return `rgba(${red},${green},${blue},${alpha === undefined ? 1 : alpha / 255}) ${pct.toFixed(1)}%`;
  });
  return `linear-gradient(to right, ${parts.join(", ")})`;
});

/** About six evenly spaced stop values, read from the palette itself. */
const ticks = computed(() => {
  const stops = palette.value;
  if (!stops || stops.length === 0) return [];
  const every = Math.max(1, Math.round((stops.length - 1) / 5));
  return stops.filter((_, i) => i % every === 0 || i === stops.length - 1).map(([v]) => v);
});

function format(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(0) : Number(value.toPrecision(3)).toString();
}
</script>

<template>
  <div class="legend" v-if="gradient">
    <span class="legend__unit">{{ unit }}</span>
    <div class="legend__bar" :style="{ background: gradient }"></div>
    <div class="legend__ticks">
      <span v-for="t in ticks" :key="t">{{ format(t) }}</span>
    </div>
  </div>
</template>
