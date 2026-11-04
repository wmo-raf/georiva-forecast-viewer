<script setup lang="ts">
/**
 * The palette of the drawn quantity as a bar, with a few of its stop values
 * and the unit. Everything on it comes from the variable's EDR description —
 * the stops, and the span to draw them over — so a palette edited in the admin
 * shows up here with no change in the app. The placing is `ui/legend.ts`.
 */
import { computed } from "vue";
import { legendBar } from "../ui/legend";
import { useViewer } from "../state/store";

const viewer = useViewer();

const hints = computed(() => viewer.parameter.value?.["x-georiva"] ?? null);
const unit = computed(() => viewer.parameter.value?.unit?.symbol ?? "");

const bar = computed(() => legendBar(hints.value?.palette, hints.value?.palette_min, hints.value?.palette_max));
</script>

<template>
  <div class="legend" v-if="bar">
    <span class="legend__unit">{{ unit }}</span>
    <div class="legend__bar" :style="{ background: bar.gradient }"></div>
    <div class="legend__ticks">
      <span v-for="t in bar.ticks" :key="t.value" class="legend__tick" :style="{ left: `${t.at}%` }">
        {{ t.label }}
      </span>
    </div>
  </div>
</template>
