<script setup lang="ts">
/**
 * The timeline: one cell per day of the run, a playhead that sits inside the
 * cell at the step's hour, a floating label with the exact step, and play.
 *
 * Two floating pills, laid out by `.strip`, which carries no chrome of its
 * own: the controls on the left and the days beside them, so the row sits at
 * one height next to the legend. The label is the playhead's handle — dragging
 * it, or anywhere on the days, scrubs through the run, snapping to real steps
 * because a step is the only thing the map can draw.
 *
 * Playback advances only once the current frame is drawn — both of its
 * textures, the raster and the wind — so a slow one stretches the frame rather
 * than skipping it, and the wind never lags the colours. Textures load lazily
 * per step.
 */
import { Pause, Play } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  cellOf,
  dayCells,
  nearestStepInCell,
  progressWithin,
  stepAtFraction,
  stepLabel,
  tooltipAnchor,
} from "../state/daystrip";
import { useViewer } from "../state/store";

const viewer = useViewer();
const props = defineProps<{ frameReady: boolean }>();

const cells = computed(() => dayCells(viewer.times.value));
const current = computed(() => cellOf(cells.value, viewer.state.step));

/** The playhead's position across the whole strip, 0 to 1. */
const playhead = computed(() => {
  const cell = current.value;
  if (!cell || cells.value.length === 0) return 0;
  const index = cells.value.indexOf(cell);
  return (index + progressWithin(viewer.times.value, viewer.state.step)) / cells.value.length;
});

/** Named in one place, `state/daystrip.ts`, so every label of a step matches. */
const label = computed(() => (viewer.time.value ? stepLabel(viewer.time.value) : ""));

const daysEl = ref<HTMLElement | null>(null);
const labelEl = ref<HTMLElement | null>(null);
const stripWidth = ref(0);
const labelWidth = ref(0);

/**
 * The label's own width decides where it can stand, so both widths are
 * measured rather than assumed: the text changes with every step, and the
 * strip with every resize.
 */
function measure() {
  stripWidth.value = daysEl.value?.offsetWidth ?? 0;
  labelWidth.value = labelEl.value?.offsetWidth ?? 0;
}

const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;

watch([daysEl, labelEl], ([days, text], previous) => {
  const [wasDays, wasText] = previous ?? [null, null];
  if (wasDays && wasDays !== days) observer?.unobserve(wasDays);
  if (wasText && wasText !== text) observer?.unobserve(wasText);
  if (days) observer?.observe(days);
  if (text) observer?.observe(text);
  measure();
});

/** The box held inside the strip, the arrow left pointing at the playhead. */
const anchor = computed(() => tooltipAnchor(playhead.value * stripWidth.value, labelWidth.value, stripWidth.value));

/** A click inside a cell picks the step nearest that point of the day. */
function pickInCell(cellIndex: number, event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const fraction = (event.clientX - target.getBoundingClientRect().left) / target.offsetWidth;
  viewer.setStep(nearestStepInCell(viewer.times.value, cells.value[cellIndex], fraction));
}

// ---- scrubbing ----

const dragging = ref(false);

function fractionAt(clientX: number): number {
  const element = daysEl.value;
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
}

function scrubTo(clientX: number) {
  viewer.setStep(stepAtFraction(viewer.times.value, cells.value, fractionAt(clientX)));
}

function onMove(event: PointerEvent) {
  if (dragging.value) scrubTo(event.clientX);
}

/**
 * Listeners on the window, not on the handle: the pointer leaves a 32px strip
 * at the first careless movement, and a drag must survive that.
 */
function startDrag() {
  if (dragging.value) return;
  dragging.value = true;
  // Playback would overwrite every step the hand sets, so it stops — and
  // stays stopped, so the play button tells the truth once the hand is off.
  viewer.setPlaying(false);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
}

function endDrag() {
  if (!dragging.value) return;
  dragging.value = false;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
}

const primary = (event: PointerEvent) => event.pointerType !== "mouse" || event.button === 0;

function grabDays(event: PointerEvent) {
  if (!primary(event)) return;
  startDrag();
  scrubTo(event.clientX);
}

function grabLabel(event: PointerEvent) {
  if (!primary(event)) return;
  // The handle already holds the current step, so it moves on the first move
  // and not on the grab. Kept off the days beneath it, which would scrub to
  // the label's own position instead.
  event.stopPropagation();
  event.preventDefault();
  startDrag();
}

// ---- playback ----

let timer: ReturnType<typeof setTimeout> | null = null;
const FRAME_MS = 700;

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (viewer.state.playing && props.frameReady) viewer.step(+1);
  }, FRAME_MS);
}

watch(
  () => [viewer.state.playing, props.frameReady, viewer.state.step] as const,
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
  endDrag();
  observer?.disconnect();
});
</script>

<template>
  <div class="strip" v-if="cells.length">
    <button
      type="button"
      class="strip__play"
      :aria-label="viewer.state.playing ? 'Pause' : 'Play'"
      @click="viewer.setPlaying(!viewer.state.playing)"
    >
      <Pause v-if="viewer.state.playing" :size="16" aria-hidden="true" />
      <Play v-else :size="16" aria-hidden="true" />
    </button>
    <div class="strip__days" ref="daysEl" @pointerdown="grabDays">
      <!-- The handle: pointer only. The chevrons and the day cells below are
           the keyboard's way through the run, so this claims no role it does
           not implement. It stops announcing mid-drag, which would otherwise
           read out every step the hand crosses. -->
      <div
        class="strip__label"
        :class="{ 'strip__label--dragging': dragging }"
        ref="labelEl"
        :style="{ left: `${anchor.left}px`, '--fv-arrow': `${anchor.arrow}px` }"
        :aria-live="dragging ? 'off' : 'polite'"
        @pointerdown="grabLabel"
      >
        {{ label }}
      </div>
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
