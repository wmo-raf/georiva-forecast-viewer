<script setup lang="ts">
/**
 * The run the map is drawing, at the head of the bar.
 *
 * A choice only when there is one to make: with several complete runs the pill
 * is a button opening a list, with one it is the same pill reading the run's
 * name and nothing more — no chevron, no focus, nothing offering a menu that
 * would be empty. With no complete run it does not render at all; the strip
 * beside it already says so, in the one place.
 *
 * The list is drawn here rather than by the OS, so it looks the same on every
 * platform: the model picker's panel, opening upward from the pill, newest run
 * first with the newest tagged "Latest". It closes on a pick, Escape or a press
 * outside it, and opening it stops playback — picking a run resets the step,
 * so a step still moving underneath would only be thrown away. From the
 * keyboard it is a listbox: the arrows move, Enter picks, Escape closes, and
 * focus goes back to the pill.
 *
 * In the Weather layer there is one run, the one the symbols were built from,
 * so the pill reads it and offers nothing.
 */
import { ChevronDown } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { formatRun } from "../state/runs";
import { useViewer } from "../state/store";

const viewer = useViewer();

const runs = computed(() => viewer.runChoices.value);
const selected = computed(() => viewer.selectedRun.value);
const choosable = computed(() => runs.value.length > 1);

const root = ref<HTMLElement | null>(null);
const pillEl = ref<HTMLButtonElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const open = ref(false);
/** The option the keyboard is on, as an index into `runs`. */
const active = ref(0);

const optionId = (index: number) => `run-option-${index}`;

function openList() {
  viewer.setPlaying(false);
  active.value = Math.max(
    0,
    runs.value.findIndex((r) => r.reference_time === selected.value),
  );
  open.value = true;
  void nextTick(() => listEl.value?.focus());
}

function close(returnFocus: boolean) {
  open.value = false;
  if (returnFocus) pillEl.value?.focus();
}

function pick(index: number) {
  const run = runs.value[index];
  if (run) viewer.pickRun(run.reference_time);
  close(true);
}

function onPillKey(event: KeyboardEvent) {
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    if (!open.value) openList();
  }
}

function onListKey(event: KeyboardEvent) {
  const last = runs.value.length - 1;
  const moves: Record<string, () => number> = {
    ArrowDown: () => Math.min(active.value + 1, last),
    ArrowUp: () => Math.max(active.value - 1, 0),
    Home: () => 0,
    End: () => last,
  };
  if (event.key in moves) {
    event.preventDefault();
    active.value = moves[event.key]();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    pick(active.value);
  } else if (event.key === "Escape") {
    event.preventDefault();
    close(true);
  } else if (event.key === "Tab") {
    close(false);
  }
}

watch(active, (index) => {
  document.getElementById(optionId(index))?.scrollIntoView({ block: "nearest" });
});

function closeOnOutsidePress(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close(false);
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener("pointerdown", closeOnOutsidePress, true);
  else document.removeEventListener("pointerdown", closeOnOutsidePress, true);
});

// A source switch brings other runs; a list of the old ones has nothing to offer.
watch(runs, () => close(false));

onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOnOutsidePress, true));
</script>

<template>
  <div class="runpick" ref="root" v-if="runs.length">
    <button
      v-if="choosable"
      ref="pillEl"
      type="button"
      class="run run--choosable"
      aria-haspopup="listbox"
      :aria-expanded="open"
      aria-controls="run-list"
      @click="open ? close(true) : openList()"
      @keydown="onPillKey"
    >
      <span class="run__eyebrow">Run</span>
      <span class="run__value">{{ formatRun(selected) }}</span>
      <ChevronDown class="run__chevron" :class="{ 'run__chevron--open': open }" :size="14" aria-hidden="true" />
    </button>
    <div v-else class="run">
      <span class="run__eyebrow">Run</span>
      <span class="run__value">{{ formatRun(selected) }}</span>
    </div>

    <ul
      v-if="open"
      id="run-list"
      ref="listEl"
      class="runpick__list"
      role="listbox"
      aria-label="Run"
      tabindex="-1"
      :aria-activedescendant="optionId(active)"
      @keydown="onListKey"
    >
      <li
        v-for="(r, i) in runs"
        :id="optionId(i)"
        :key="r.reference_time"
        role="option"
        class="runpick__option"
        :class="{
          'runpick__option--selected': r.reference_time === selected,
          'runpick__option--active': i === active,
        }"
        :aria-selected="r.reference_time === selected"
        @click="pick(i)"
        @pointermove="active = i"
      >
        <span>{{ formatRun(r.reference_time) }}</span>
        <span v-if="i === 0" class="runpick__tag">Latest</span>
      </li>
    </ul>
  </div>
</template>
