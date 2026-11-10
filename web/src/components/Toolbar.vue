<script setup lang="ts">
/**
 * The map toolbar, in the corner column between the model picker and the
 * legend: zoom in, zoom out, wind, pressure and full screen, in one row at its
 * own width, right-aligned: a fixed step per tool, up to the column's width.
 *
 * Wind is the toolbar's alone — the rail lists scalar quantities only. Its
 * button says whether wind is drawn (accent when on, muted when off) and opens
 * a dropup with the switch and how the trails look. The dropup closes from its
 * button, Escape or a press anywhere outside the toolbar; changing a setting
 * leaves it open so the map can be watched as it changes. A model with no wind
 * disables the button and closes the dropup.
 *
 * Pressure follows the same pattern: a button (accent while isobars or H/L are
 * drawn) opening a dropup with the two switches and nothing else — interval,
 * colour and radius are the operator's or the map's. A model with no pressure
 * binding disables it. One dropup is open at a time.
 *
 * Weather symbols too: a button (accent while symbols are drawn) opening a
 * switch, on by default, and a line saying what the symbols are for. They are
 * a Forti model's latest run alone, so with another run selected the line says
 * which run they belong to and offers to show it. A source with no symbols
 * model disables the button.
 *
 * Full screen covers the whole page, chrome included, and is left out where
 * the browser has no Fullscreen API (Safari on iPhone) rather than shown as a
 * button that can never work.
 */
import { ChevronUp, CloudSun, Gauge, Maximize, Minimize, Minus, Plus, Wind } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useZoom } from "../map/zoom";
import { useViewer } from "../state/store";
import { formatRun } from "../state/runs";
import { DENSITIES, RANGES, type Density } from "../state/windSettings";

const viewer = useViewer();
const zoom = useZoom();
const root = ref<HTMLElement | null>(null);

// ---- wind ----

const windAvailable = computed(() => viewer.windBinding.value !== null);
const windOn = computed(() => viewer.state.wind.on && windAvailable.value);
const settings = computed(() => viewer.state.wind);
/** A toolbar button that opens a panel above the bar. */
type Dropup = "wind" | "pressure" | "symbols";

/** The dropup that is open, if any: one at a time, so they never stack over each other. */
const open = ref<Dropup | null>(null);
const windOpen = computed(() => open.value === "wind");
const pressureOpen = computed(() => open.value === "pressure");
const symbolsOpen = computed(() => open.value === "symbols");

function toggle(which: Dropup) {
  open.value = open.value === which ? null : which;
}

watch(windAvailable, (available) => {
  if (!available && windOpen.value) open.value = null;
});

function closeOnOutsidePress(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = null;
}

watch(open, (current) => {
  if (current) document.addEventListener("pointerdown", closeOnOutsidePress, true);
  else document.removeEventListener("pointerdown", closeOnOutsidePress, true);
});

// ---- pressure ----

const pressureAvailable = computed(() => viewer.pressureOverlay.value !== null);
const pressure = computed(() => viewer.state.pressure);
const pressureOn = computed(() => pressureAvailable.value && (pressure.value.isobars || pressure.value.highLow));

watch(pressureAvailable, (available) => {
  if (!available && pressureOpen.value) open.value = null;
});

function setPressureSwitch(key: "isobars" | "highLow", event: Event) {
  viewer.setPressure({ [key]: (event.target as HTMLInputElement).checked });
}

// ---- weather symbols ----

const symbols = viewer.symbols;
const symbolsAvailable = computed(() => symbols.value.state !== "none");
const symbolsOn = computed(() => viewer.symbolsToDraw.value !== null);

watch(symbolsAvailable, (available) => {
  if (!available && symbolsOpen.value) open.value = null;
});

/** What the symbols are, or why they are not on the map. */
const symbolsNote = computed(() => {
  const current = symbols.value;
  switch (current.state) {
    case "loading":
      return "Loading the town forecasts…";
    case "unavailable":
      return "The town forecasts are unavailable right now.";
    case "other-run":
      return `Symbols are for the ${formatRun(current.run)} run only.`;
    case "ready": {
      const window = viewer.state.symbolsMatrix?.window.duration.replace(/^PT(\d+)H$/, "$1");
      return window ? `Each symbol covers the ${window} h from the time shown.` : "";
    }
    default:
      return "";
  }
});

function setNumber(key: "speed" | "width" | "life", event: Event) {
  viewer.setWind({ [key]: Number((event.target as HTMLInputElement).value) });
}

function setDensity(density: Density) {
  viewer.setWind({ density });
}

// ---- full screen ----

const fullscreenSupported = typeof document !== "undefined" && !!document.fullscreenEnabled;
const fullscreen = ref(false);

function syncFullscreen() {
  fullscreen.value = document.fullscreenElement !== null;
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    // Refused by the browser (no user gesture, or a policy): nothing changes.
  }
}

onMounted(() => {
  if (fullscreenSupported) {
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreen);
  document.removeEventListener("pointerdown", closeOnOutsidePress, true);
});
</script>

<template>
  <div ref="root" class="tools" @keydown.escape="open = null">
    <div v-if="windOpen" id="wind-panel" class="dropup" role="group" aria-label="Wind settings">
      <label class="dropup__switch-row">
        <span class="dropup__title">Wind</span>
        <input
          type="checkbox"
          role="switch"
          class="switch"
          :checked="settings.on"
          @change="viewer.setWind({ on: ($event.target as HTMLInputElement).checked })"
        />
      </label>

      <fieldset class="wind__settings" :disabled="!settings.on">
        <label class="wind__field">
          <span class="wind__label">Speed</span>
          <input
            type="range"
            class="wind__slider"
            :min="RANGES.speed.min"
            :max="RANGES.speed.max"
            :step="RANGES.speed.step"
            :value="settings.speed"
            @input="setNumber('speed', $event)"
          />
          <span class="wind__ends" aria-hidden="true"><span>Slow</span><span>Fast</span></span>
        </label>

        <label class="wind__field">
          <span class="wind__label">
            Line width <span class="wind__value">{{ settings.width.toFixed(1) }} px</span>
          </span>
          <input
            type="range"
            class="wind__slider"
            :min="RANGES.width.min"
            :max="RANGES.width.max"
            :step="RANGES.width.step"
            :value="settings.width"
            @input="setNumber('width', $event)"
          />
        </label>

        <label class="wind__field">
          <span class="wind__label">Particle life</span>
          <input
            type="range"
            class="wind__slider"
            :min="RANGES.life.min"
            :max="RANGES.life.max"
            :step="RANGES.life.step"
            :value="settings.life"
            @input="setNumber('life', $event)"
          />
          <span class="wind__ends" aria-hidden="true"><span>Short</span><span>Long</span></span>
        </label>

        <div class="wind__field">
          <span id="wind-density" class="wind__label">Density</span>
          <div class="wind__segments" role="radiogroup" aria-labelledby="wind-density">
            <button
              v-for="d in DENSITIES"
              :key="d.value"
              type="button"
              role="radio"
              class="wind__segment"
              :class="{ 'wind__segment--selected': settings.density === d.value }"
              :aria-checked="settings.density === d.value"
              @click="setDensity(d.value)"
            >
              {{ d.label }}
            </button>
          </div>
        </div>
      </fieldset>

      <button type="button" class="wind__reset" @click="viewer.resetWind()">Reset</button>
    </div>

    <div v-if="pressureOpen" id="pressure-panel" class="dropup" role="group" aria-label="Pressure overlay">
      <span class="dropup__title dropup__heading">Pressure</span>
      <label class="dropup__switch-row dropup__switch-row--plain">
        <span>Isobars</span>
        <input
          type="checkbox"
          role="switch"
          class="switch"
          :checked="pressure.isobars"
          @change="setPressureSwitch('isobars', $event)"
        />
      </label>
      <label class="dropup__switch-row dropup__switch-row--plain">
        <span>Highs and lows</span>
        <input
          type="checkbox"
          role="switch"
          class="switch"
          :checked="pressure.highLow"
          @change="setPressureSwitch('highLow', $event)"
        />
      </label>
    </div>

    <div v-if="symbolsOpen" id="symbols-panel" class="dropup" role="group" aria-label="Weather symbols">
      <label class="dropup__switch-row">
        <span class="dropup__title">Weather symbols</span>
        <input
          type="checkbox"
          role="switch"
          class="switch"
          :checked="viewer.state.symbols.on"
          @change="viewer.setSymbols(($event.target as HTMLInputElement).checked)"
        />
      </label>
      <p v-if="symbolsNote" class="dropup__note">{{ symbolsNote }}</p>
      <button
        v-if="symbols.state === 'other-run'"
        type="button"
        class="wind__reset"
        @click="viewer.showSymbolsRun()"
      >
        Show that run
      </button>
    </div>

    <div class="tools__bar" role="toolbar" aria-label="Map tools">
      <button
        type="button"
        class="tools__button"
        title="Zoom in"
        aria-label="Zoom in"
        :disabled="!zoom.canZoomIn.value"
        @click="zoom.zoomIn()"
      >
        <Plus :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tools__button"
        title="Zoom out"
        aria-label="Zoom out"
        :disabled="!zoom.canZoomOut.value"
        @click="zoom.zoomOut()"
      >
        <Minus :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tools__button tools__button--dropup"
        :class="{ 'tools__button--active': windOn }"
        :title="windAvailable ? 'Wind settings' : 'This model has no wind data'"
        aria-label="Wind settings"
        :aria-expanded="windOpen"
        aria-controls="wind-panel"
        :disabled="!windAvailable"
        @click="toggle('wind')"
      >
        <Wind :size="16" :stroke-width="1.75" aria-hidden="true" />
        <ChevronUp
          class="tools__caret"
          :class="{ 'tools__caret--open': windOpen }"
          :size="12"
          :stroke-width="2"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="tools__button tools__button--dropup"
        :class="{ 'tools__button--active': pressureOn }"
        :title="pressureAvailable ? 'Pressure overlay' : 'This model has no pressure overlay'"
        aria-label="Pressure overlay"
        :aria-expanded="pressureOpen"
        aria-controls="pressure-panel"
        :disabled="!pressureAvailable"
        @click="toggle('pressure')"
      >
        <Gauge :size="16" :stroke-width="1.75" aria-hidden="true" />
        <ChevronUp
          class="tools__caret"
          :class="{ 'tools__caret--open': pressureOpen }"
          :size="12"
          :stroke-width="2"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="tools__button tools__button--dropup"
        :class="{ 'tools__button--active': symbolsOn }"
        :title="symbolsAvailable ? 'Weather symbols' : 'This model has no weather symbols'"
        aria-label="Weather symbols"
        :aria-expanded="symbolsOpen"
        aria-controls="symbols-panel"
        :disabled="!symbolsAvailable"
        @click="toggle('symbols')"
      >
        <CloudSun :size="16" :stroke-width="1.75" aria-hidden="true" />
        <ChevronUp
          class="tools__caret"
          :class="{ 'tools__caret--open': symbolsOpen }"
          :size="12"
          :stroke-width="2"
          aria-hidden="true"
        />
      </button>
      <button
        v-if="fullscreenSupported"
        type="button"
        class="tools__button"
        :title="fullscreen ? 'Exit full screen' : 'Full screen'"
        :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
        @click="toggleFullscreen"
      >
        <component :is="fullscreen ? Minimize : Maximize" :size="16" :stroke-width="1.75" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
