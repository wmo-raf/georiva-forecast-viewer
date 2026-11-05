<script setup lang="ts">
/**
 * The palette of the drawn quantity as one compact pill: the unit at the left,
 * then the ramp filling the rest of it edge to edge. Everything on it comes
 * from the variable's EDR description — the stops, and the span to draw them
 * over — so a palette edited in the admin shows up here with no change in the
 * app. Which of the two shapes it takes, and every colour on it, is decided in
 * `ui/legend.ts`; this only draws what that returns.
 */
import { computed } from "vue";
import { legendBar } from "../ui/legend";
import { useViewer } from "../state/store";

const viewer = useViewer();

const hints = computed(() => viewer.parameter.value?.["x-georiva"] ?? null);
const unit = computed(() => viewer.parameter.value?.unit?.symbol ?? "");

const bar = computed(() =>
  legendBar(hints.value?.palette, hints.value?.palette_min, hints.value?.palette_max, unit.value),
);
</script>

<template>
  <div class="legend" v-if="bar">
    <span class="legend__unit" v-if="unit">{{ unit }}</span>

    <!-- A classification: one block per class, its lower boundary on it. -->
    <div class="legend__ramp" v-if="bar.kind === 'stepped'">
      <div
        v-for="band in bar.classes"
        :key="band.value"
        class="legend__class"
        :style="{ background: band.colour, color: band.textColour }"
        :title="band.title"
      >
        <span v-if="band.label" class="legend__value">{{ band.label }}</span>
      </div>
    </div>

    <!-- A ramp: the gradient, with a few values named on top of it. -->
    <div class="legend__ramp legend__ramp--smooth" v-else :style="{ background: bar.gradient }">
      <span
        v-for="tick in bar.ticks"
        :key="tick.value"
        class="legend__tick"
        :style="{ left: `${tick.at}%`, color: tick.textColour }"
      >
        {{ tick.label }}
      </span>
    </div>
  </div>
</template>
