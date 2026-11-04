<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useViewer } from "../state/store";

const viewer = useViewer();
const props = defineProps<{ textureReady: boolean }>();

const runs = computed(() => viewer.state.timeline?.runs ?? []);
const selectedRun = computed(() => viewer.state.timeline?.selected ?? "");
const count = computed(() => viewer.times.value.length);

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

function formatRun(iso: string): string {
  return `${formatTime(iso)} UTC`;
}

const leadHours = computed(() => {
  const run = viewer.run.value;
  const time = viewer.time.value;
  if (!run || !time) return null;
  return Math.round((Date.parse(time) - Date.parse(run.reference_time)) / 3_600_000);
});

// Playback advances only once the current frame is drawn, so a slow texture
// stretches the frame rather than skipping it; textures load lazily per step.
let timer: ReturnType<typeof setTimeout> | null = null;
const FRAME_MS = 700;

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!viewer.state.playing) return;
  timer = setTimeout(() => {
    timer = null;
    if (viewer.state.playing && props.textureReady) viewer.step(+1);
  }, FRAME_MS);
}

watch(
  () => [viewer.state.playing, props.textureReady, viewer.state.step],
  () => {
    if (viewer.state.playing && props.textureReady) scheduleNext();
  },
);
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="timeline" v-if="runs.length">
    <div class="timeline__row">
      <label class="timeline__run">
        <span>Run</span>
        <select :value="selectedRun" @change="viewer.pickRun(($event.target as HTMLSelectElement).value)">
          <option v-for="r in runs" :key="r.reference_time" :value="r.reference_time">
            {{ formatRun(r.reference_time) }}
          </option>
        </select>
      </label>
      <div class="timeline__time">
        <strong>{{ formatTime(viewer.time.value) }} UTC</strong>
        <span v-if="leadHours !== null" class="timeline__lead">+{{ leadHours }} h</span>
      </div>
    </div>
    <div class="timeline__row">
      <button type="button" class="timeline__button" aria-label="Previous step" @click="viewer.step(-1)">‹</button>
      <button
        type="button"
        class="timeline__button"
        :aria-label="viewer.state.playing ? 'Pause' : 'Play'"
        @click="viewer.setPlaying(!viewer.state.playing)"
      >
        {{ viewer.state.playing ? "❚❚" : "▶" }}
      </button>
      <button type="button" class="timeline__button" aria-label="Next step" @click="viewer.step(+1)">›</button>
      <input
        class="timeline__slider"
        type="range"
        min="0"
        :max="Math.max(count - 1, 0)"
        :value="viewer.state.step"
        aria-label="Lead time"
        @input="viewer.setStep(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="timeline__count">{{ viewer.state.step + 1 }} / {{ count }}</span>
    </div>
  </div>
  <div class="timeline timeline--empty" v-else-if="viewer.state.timeline">No complete run yet for this source.</div>
</template>
