<script setup lang="ts">
/**
 * The palette of the drawn frame as one compact pill: the unit at the left,
 * then the ramp filling the rest of it edge to edge. Everything on it comes
 * from the variable's EDR description — the stops, and the span to draw them
 * over — so a palette edited in the admin shows up here with no change in the
 * app. Which of the two shapes it takes, and every colour on it, is decided in
 * `ui/legend.ts`; this only draws what that returns.
 *
 * Its slot is held whatever the state, so nothing above it moves: a skeleton
 * while loading, an invisible placeholder for a quantity with no palette.
 */
import { computed } from "vue";
import { legendBar } from "../ui/legend";
import { useViewer } from "../state/store";

const viewer = useViewer();

// The parameter the map is painted with, not the selected one: across a
// quantity switch the legend changes in the frame the raster does.
const hints = computed(() => viewer.shownParameter.value?.["x-georiva"] ?? null);
const unit = computed(() => viewer.shownParameter.value?.unit?.symbol ?? "");

const bar = computed(() =>
  legendBar(hints.value?.palette, hints.value?.palette_min, hints.value?.palette_max, unit.value),
);
</script>

<template>
  <!-- The slot is always there, at the legend's height, so the picker and the
       toolbar standing on it never move: a skeleton while the description is
       on its way, empty when the quantity has no palette to show. -->
  <div v-if="bar" class="legend">
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
      <!-- The top of the range, on the last class's colour: the one boundary
           no class begins at, and so the one that closes the scale. -->
      <span class="legend__end" :style="{ background: bar.end.colour, color: bar.end.textColour }">
        {{ bar.end.label }}
      </span>
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
  <div v-else-if="viewer.loading.value || viewer.stalled.value" class="legend legend--skel" aria-hidden="true">
    <span class="skel skel--fill" :class="{ 'skel--still': viewer.stalled.value }"></span>
  </div>
  <div v-else class="legend legend--none" aria-hidden="true"></div>
</template>
