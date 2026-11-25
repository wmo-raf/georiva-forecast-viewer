<script setup lang="ts">
/**
 * The timeline: one cell per day of the run, a progress fill along the top
 * that reaches the step's hour inside its cell, a floating label with the
 * exact step, and previous / play / next.
 *
 * Two floating pills, laid out by `.strip`, which carries no chrome of its
 * own: the controls on the left and the days beside them, so the row sits at
 * one height next to the legend. A day never shrinks past a comfortable width;
 * a run with more days than fit scrolls, following the playhead. The label is the playhead's handle — dragging
 * it, or anywhere on the days, scrubs through the run, snapping to real steps
 * because a step is the only thing the map can draw.
 *
 * Playback advances only once the current frame is drawn — both of its
 * textures, the raster and the wind — so a slow one stretches the frame rather
 * than skipping it, and the wind never lags the colours. Textures load lazily
 * per step.
 *
 * Before its runs land — on load, and on every model switch — it stands as a
 * skeleton at its final size, so the bar never changes shape underneath it.
 */
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  cellOf,
  dayCells,
  followScroll,
  nearestStepInCell,
  progressWithin,
  stepAtFraction,
  stepLabel,
  tooltipAnchor,
} from "../state/daystrip";
import { useViewer } from "../state/store";
import RunPicker from "./RunPicker.vue";

const viewer = useViewer();
const props = defineProps<{ frameReady: boolean }>();

const cells = computed(() => dayCells(viewer.times.value));
const current = computed(() => cellOf(cells.value, viewer.state.step));

/** The playhead's position across the whole run, 0 to 1. */
const playhead = computed(() => {
  const cell = current.value;
  if (!cell || cells.value.length === 0) return 0;
  const index = cells.value.indexOf(cell);
  return (index + progressWithin(viewer.times.value, viewer.state.step)) / cells.value.length;
});

/** Named in one place, `state/daystrip.ts`, so every label of a step matches. */
const label = computed(() => (viewer.time.value ? stepLabel(viewer.time.value) : ""));

// ---- prev / next ----

const atFirst = computed(() => viewer.state.step <= 0);
const atLast = computed(() => viewer.state.step >= viewer.times.value.length - 1);

/**
 * One step either way, held at the ends rather than wrapping as playback
 * does: the button is disabled there, so it never jumps the run end to end.
 * It stops playback for the reason a drag does — the next frame would
 * overwrite the step it set.
 */
function nudge(delta: number) {
  viewer.setPlaying(false);
  viewer.setStep(viewer.state.step + delta);
}

// ---- the days, and the window onto them ----

/*
 * Each cell has a floor, `--fv-cell-min`; when the run has more days than the
 * panel can hold at that width, the days scroll inside it. So three widths
 * matter: the scroller's visible width, the track's full width that the
 * playhead is measured across, and how far the scroller has scrolled. The
 * label lives outside the scroller — which must clip — and is placed within
 * its visible width.
 */
const scrollEl = ref<HTMLElement | null>(null);
const trackEl = ref<HTMLElement | null>(null);
const labelEl = ref<HTMLElement | null>(null);
const viewportWidth = ref(0);
const trackWidth = ref(0);
const labelWidth = ref(0);
const scrollLeft = ref(0);

/**
 * The label's own width decides where it can stand, so every width is
 * measured rather than assumed: the text changes with every step, and the
 * strip with every resize.
 */
function measure() {
  viewportWidth.value = scrollEl.value?.clientWidth ?? 0;
  trackWidth.value = trackEl.value?.offsetWidth ?? 0;
  labelWidth.value = labelEl.value?.offsetWidth ?? 0;
  scrollLeft.value = scrollEl.value?.scrollLeft ?? 0;
}

const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;

watch([scrollEl, trackEl, labelEl], (elements, previous) => {
  previous?.forEach((was, i) => {
    if (was && was !== elements[i]) observer?.unobserve(was);
  });
  elements.forEach((el) => el && observer?.observe(el));
  measure();
});

/** Hidden days off either edge, each edge fading where there are some. */
const hiddenLeft = computed(() => scrollLeft.value > 1);
const hiddenRight = computed(() => scrollLeft.value + viewportWidth.value < trackWidth.value - 1);

/** The playhead in pixels across the track, and then across what is visible of it. */
const playheadPx = computed(() => playhead.value * trackWidth.value);

/** The box held inside the visible strip, the arrow left pointing at the playhead. */
const anchor = computed(() =>
  tooltipAnchor(playheadPx.value - scrollLeft.value, labelWidth.value, viewportWidth.value),
);

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Keep the playhead in view as it moves — by playback, the buttons or a click
 * — scrolling only once it comes within a cell of an edge. Not while the hand
 * holds it: the drag scrolls the strip itself, at the edges.
 */
function follow(smooth: boolean) {
  const el = scrollEl.value;
  if (!el || dragging.value || cells.value.length === 0) return;
  const target = followScroll(
    playheadPx.value,
    el.scrollLeft,
    el.clientWidth,
    trackWidth.value,
    trackWidth.value / cells.value.length,
  );
  if (Math.abs(target - el.scrollLeft) < 1) return;
  el.scrollTo({ left: target, behavior: smooth && !reducedMotion ? "smooth" : "auto" });
}

watch(() => viewer.state.step, () => follow(true));
// A new run, or a resize that changes how much fits: snap, don't glide.
watch([cells, viewportWidth, trackWidth], () => follow(false), { flush: "post" });

function onScroll() {
  scrollLeft.value = scrollEl.value?.scrollLeft ?? 0;
}

/**
 * A mouse wheel turns vertically; the strip only scrolls across, so a
 * vertical turn scrolls it across. A trackpad's sideways swipe already does,
 * and is left alone. Only when there is somewhere to scroll — otherwise the
 * wheel is not the strip's to take.
 */
function onWheel(event: WheelEvent) {
  const el = scrollEl.value;
  if (!el || el.scrollWidth <= el.clientWidth) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  event.preventDefault();
  el.scrollLeft += event.deltaY;
}

/** A click inside a cell picks the step nearest that point of the day. */
function pickInCell(cellIndex: number, event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const fraction = (event.clientX - target.getBoundingClientRect().left) / target.offsetWidth;
  viewer.setStep(nearestStepInCell(viewer.times.value, cells.value[cellIndex], fraction));
}

// ---- scrubbing ----

const dragging = ref(false);
let pointerX = 0;

/** Across the track, not the window onto it, so a scrolled strip reads true. */
function fractionAt(clientX: number): number {
  const element = trackEl.value;
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
}

function scrubTo(clientX: number) {
  viewer.setStep(stepAtFraction(viewer.times.value, cells.value, fractionAt(clientX)));
}

function onMove(event: PointerEvent) {
  if (!dragging.value) return;
  pointerX = event.clientX;
  scrubTo(pointerX);
}

/*
 * Held at either edge of a strip that scrolls, the hand scrolls it on: faster
 * the nearer the edge, or past it, and scrubbing to whatever comes under the
 * pointer as the days slide by.
 */
const EDGE_PX = 32;
const EDGE_SPEED = 12;
let edgeFrame: number | null = null;

function edgeScroll() {
  edgeFrame = null;
  const el = scrollEl.value;
  if (!dragging.value || !el) return;
  const rect = el.getBoundingClientRect();
  const intoLeft = rect.left + EDGE_PX - pointerX;
  const intoRight = pointerX - (rect.right - EDGE_PX);
  const push = intoLeft > 0 ? -Math.min(1, intoLeft / EDGE_PX) : intoRight > 0 ? Math.min(1, intoRight / EDGE_PX) : 0;
  if (push !== 0) {
    const before = el.scrollLeft;
    el.scrollLeft += push * EDGE_SPEED;
    if (el.scrollLeft !== before) scrubTo(pointerX);
  }
  edgeFrame = requestAnimationFrame(edgeScroll);
}

/**
 * Listeners on the window, not on the handle: the pointer leaves a 32px strip
 * at the first careless movement, and a drag must survive that.
 */
function startDrag(clientX: number) {
  if (dragging.value) return;
  dragging.value = true;
  pointerX = clientX;
  // Playback would overwrite every step the hand sets, so it stops — and
  // stays stopped, so the play button tells the truth once the hand is off.
  viewer.setPlaying(false);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  edgeFrame = requestAnimationFrame(edgeScroll);
}

function endDrag() {
  if (!dragging.value) return;
  dragging.value = false;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  if (edgeFrame !== null) cancelAnimationFrame(edgeFrame);
  edgeFrame = null;
}

const primary = (event: PointerEvent) => event.pointerType !== "mouse" || event.button === 0;

function grabDays(event: PointerEvent) {
  if (!primary(event)) return;
  startDrag(event.clientX);
  scrubTo(event.clientX);
}

function grabLabel(event: PointerEvent) {
  if (!primary(event)) return;
  // The handle already holds the current step, so it moves on the first move
  // and not on the grab. Kept off the days beneath it, which would scrub to
  // the label's own position instead.
  event.stopPropagation();
  event.preventDefault();
  startDrag(event.clientX);
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
    <RunPicker />
    <!-- The controls and the days travel together: when the run pill can no
         longer share a line with them, this pair wraps below it rather than
         the days being squeezed to nothing. -->
    <div class="strip__timeline">
      <div class="strip__controls">
        <button type="button" class="strip__nudge" aria-label="Previous step" :disabled="atFirst" @click="nudge(-1)">
          <ChevronLeft :size="16" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="strip__play"
          :aria-label="viewer.state.playing ? 'Pause' : 'Play'"
          @click="viewer.setPlaying(!viewer.state.playing)"
        >
          <Pause v-if="viewer.state.playing" :size="14" aria-hidden="true" />
          <Play v-else :size="14" aria-hidden="true" />
        </button>
        <button type="button" class="strip__nudge" aria-label="Next step" :disabled="atLast" @click="nudge(+1)">
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>
      <div class="strip__days">
        <!-- The handle: pointer only. The day cells below are the keyboard's
             way through the run, so this claims no role it does not
             implement. It stops announcing mid-drag, which would otherwise
             read out every step the hand crosses. Outside the scroller, which
             clips, and placed within its visible width. -->
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
        <div
          class="strip__scroller"
          :class="{ 'strip__scroller--left': hiddenLeft, 'strip__scroller--right': hiddenRight }"
          ref="scrollEl"
          @scroll.passive="onScroll"
          @wheel="onWheel"
          @pointerdown="grabDays"
        >
          <div class="strip__track" ref="trackEl" :style="{ '--fv-cells': cells.length }">
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
            <!-- Progress, as a video player draws it: a thin track along the
                 top, filled up to the playhead. The fill's end is the
                 position; the label above points at it and is the handle. -->
            <div class="strip__progress" aria-hidden="true">
              <div
                class="strip__fill"
                :class="{ 'strip__fill--held': dragging }"
                :style="{ width: `${playhead * 100}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Only once this source's own timeline is in: during a switch the last
       source's timeline is still held, and its emptiness is not this one's. -->
  <div class="strip strip--empty" v-else-if="viewer.timelineCurrent.value">No complete run yet for this model.</div>
  <!-- Loading, or a load that failed: the strip at its final size, so neither
       it nor the corner beside it moves when the runs land. -->
  <div class="strip" v-else aria-hidden="true">
    <div class="runpick">
      <div class="run">
        <span class="run__eyebrow">Run</span>
        <span class="run__value">
          <span class="skel skel--line run__skel" :class="{ 'skel--still': viewer.stalled.value }"></span>
        </span>
      </div>
    </div>
    <div class="strip__timeline">
      <div class="strip__controls">
        <button type="button" class="strip__nudge" disabled tabindex="-1">
          <ChevronLeft :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="strip__play" disabled tabindex="-1">
          <Play :size="14" aria-hidden="true" />
        </button>
        <button type="button" class="strip__nudge" disabled tabindex="-1">
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>
      <div class="strip__days">
        <span class="skel skel--fill" :class="{ 'skel--still': viewer.stalled.value }"></span>
      </div>
    </div>
  </div>
</template>
