<script setup lang="ts">
/**
 * The default style of the drawn frame as one compact pill: the unit at the
 * left, then the bar core laid out (`x-georiva.legend`) with its values on it.
 * Where every colour and value sits, and which values are labelled, is core's
 * (`ui/legend.ts` only reads it), so a style edited in the admin shows up here
 * as it does on every other GeoRiva legend, with no change in the app.
 *
 * The one judgement made here is the bar's width: a stepped legend's labels
 * that would overlap on it are thinned, every second, third ... with both ends
 * kept, and again whenever the pill is resized, as core's `legend.js` does.
 *
 * Its slot is held whatever the state, so nothing above it moves: a skeleton
 * while loading, an invisible placeholder for a quantity with nothing to show.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { extent, fitting, legendBar } from "../ui/legend";
import { useViewer } from "../state/store";

const viewer = useViewer();

// The parameter the map is painted with, not the selected one: across a
// quantity switch the legend changes in the frame the raster does.
const unit = computed(() => viewer.shownParameter.value?.unit?.symbol ?? "");
const bar = computed(() => legendBar(viewer.shownParameter.value?.["x-georiva"].legend));

const ramp = ref<HTMLDivElement | null>(null);
const labelEls = ref<HTMLSpanElement[]>([]);
/** The tick indices a narrow bar has no room for. */
const hidden = ref<Set<number>>(new Set());

function fit() {
  const legend = bar.value;
  const width = ramp.value?.clientWidth ?? 0;
  if (!legend?.stepped || !width || labelEls.value.length !== legend.labels.length) {
    hidden.value = new Set();
    return;
  }
  // Measured whatever is hidden: `visibility` keeps a label's width.
  const extents = legend.labels.map((label, i) =>
    extent(label.at, labelEls.value[i].getBoundingClientRect().width, width, label.align),
  );
  const shown = new Set(fitting(extents).map((at) => legend.labels[at].index));
  hidden.value = new Set(legend.labels.map((label) => label.index).filter((index) => !shown.has(index)));
}

const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => fit());
watch(ramp, (element, previous) => {
  if (previous) observer?.unobserve(previous);
  if (element) observer?.observe(element);
});
watch(bar, () => nextTick(fit), { immediate: true });
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <!-- The slot is always there, at the legend's height, so the picker and the
       toolbar standing on it never move: a skeleton while the description is
       on its way, empty when the quantity has nothing to show — and empty in
       Weather, which has no colour scale. -->
  <div v-if="viewer.weather.value" class="legend legend--none" aria-hidden="true"></div>
  <div v-else-if="bar" class="legend" :class="{ 'legend--unitless': !unit }">
    <span class="legend__unit" v-if="unit">{{ unit }}</span>

    <div class="legend__scale">
      <!-- An arrow only on a clamped end: values beyond it take its colour. -->
      <span v-if="bar.under" class="legend__arrow legend__arrow--under" :style="{ background: bar.under }"></span>
      <div ref="ramp" class="legend__ramp" :style="{ background: bar.gradient }">
        <span
          v-for="tick in bar.labels"
          :key="tick.index"
          ref="labelEls"
          class="legend__tick"
          :class="`legend__tick--${tick.align}`"
          :style="{ left: `${tick.at}%`, color: tick.textColour, visibility: hidden.has(tick.index) ? 'hidden' : undefined }"
        >
          {{ tick.text }}
        </span>
      </div>
      <span v-if="bar.over" class="legend__arrow legend__arrow--over" :style="{ background: bar.over }"></span>
    </div>
  </div>
  <div v-else-if="viewer.loading.value || viewer.stalled.value" class="legend legend--skel" aria-hidden="true">
    <span class="skel skel--fill" :class="{ 'skel--still': viewer.stalled.value }"></span>
  </div>
  <div v-else class="legend legend--none" aria-hidden="true"></div>
</template>
