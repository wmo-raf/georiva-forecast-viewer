<script setup lang="ts">
/**
 * The timeline: one cell per day of the run, a playhead that sits inside the
 * cell at the step's hour, a floating label with the exact step, and play.
 * Playback advances only once the current frame is drawn, so a slow texture
 * stretches the frame rather than skipping it; textures load lazily per step.
 */
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-vue-next";
import { computed, onBeforeUnmount, watch } from "vue";
import { cellOf, dayCells, progressWithin } from "../state/daystrip";
import { useViewer } from "../state/store";

const viewer = useViewer();
const props = defineProps<{ textureReady: boolean }>();

const cells = computed(() => dayCells(viewer.times.value));
const current = computed(() => cellOf(cells.value, viewer.state.step));

/** The playhead's position across the whole strip, 0 to 1. */
const playhead = computed(() => {
  const cell = current.value;
  if (!cell || cells.value.length === 0) return 0;
  const index = cells.value.indexOf(cell);
  return (index + progressWithin(cell, viewer.times.value, viewer.state.step)) / cells.value.length;
});

const label = computed(() => {
  const iso = viewer.time.value;
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" });
  return `${day} · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
});

/** A click inside a cell picks the step nearest that point of the day. */
function pickInCell(cellIndex: number, event: MouseEvent) {
  const cell = cells.value[cellIndex];
  const target = event.currentTarget as HTMLElement;
  const fraction = (event.clientX - target.getBoundingClientRect().left) / target.offsetWidth;
  let best = cell.steps[0];
  let distance = Infinity;
  for (const step of cell.steps) {
    const d = Math.abs(progressWithin(cell, viewer.times.value, step) - fraction);
    if (d < distance) {
      distance = d;
      best = step;
    }
  }
  viewer.setStep(best);
}

let timer: ReturnType<typeof setTimeout> | null = null;
const FRAME_MS = 700;

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (viewer.state.playing && props.textureReady) viewer.step(+1);
  }, FRAME_MS);
}

watch(
  () => [viewer.state.playing, props.textureReady, viewer.state.step] as const,
  ([playing, ready]) => {
    if (playing && ready) scheduleNext();
    else if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  },
);
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="strip" v-if="cells.length">
    <div class="strip__controls">
      <button type="button" class="strip__button" aria-label="Previous step" @click="viewer.step(-1)">
        <ChevronLeft :size="18" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="strip__button strip__button--play"
        :aria-label="viewer.state.playing ? 'Pause' : 'Play'"
        @click="viewer.setPlaying(!viewer.state.playing)"
      >
        <Pause v-if="viewer.state.playing" :size="18" aria-hidden="true" />
        <Play v-else :size="18" aria-hidden="true" />
      </button>
      <button type="button" class="strip__button" aria-label="Next step" @click="viewer.step(+1)">
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
    </div>
    <div class="strip__days">
      <div class="strip__label" :style="{ left: `${playhead * 100}%` }">{{ label }}</div>
      <button
        v-for="(cell, i) in cells"
        :key="cell.key"
        type="button"
        class="strip__day"
        :class="{ 'strip__day--current': cell === current }"
        @click="pickInCell(i, $event)"
      >
        <span class="strip__daynum">{{ cell.day }}</span>
        <span class="strip__weekday">{{ cell.weekday }}</span>
      </button>
      <div class="strip__playhead" :style="{ left: `${playhead * 100}%` }"></div>
    </div>
  </div>
  <div class="strip strip--empty" v-else-if="viewer.state.timeline">No complete run yet for this model.</div>
</template>
