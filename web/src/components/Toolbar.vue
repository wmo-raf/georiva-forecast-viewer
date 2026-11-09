<script setup lang="ts">
/**
 * The map toolbar, in the corner column between the model picker and the
 * legend: zoom in, zoom out, wind and full screen, in one row at the column's
 * width, each button an equal share of it.
 *
 * Wind is the toolbar's alone — the rail lists scalar quantities only. Its
 * button says whether wind is drawn (accent when on, muted when off) and opens
 * a dropup with the switch and how the trails look. The dropup closes from its
 * button, Escape or a press anywhere outside the toolbar; changing a setting
 * leaves it open so the map can be watched as it changes. A model with no wind
 * disables the button and closes the dropup.
 *
 * Full screen covers the whole page, chrome included, and is left out where
 * the browser has no Fullscreen API (Safari on iPhone) rather than shown as a
 * button that can never work.
 */
import { ChevronUp, Maximize, Minimize, Minus, Plus, Wind } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useZoom } from "../map/zoom";
import { useViewer } from "../state/store";
import { DENSITIES, RANGES, type Density } from "../state/windSettings";

const viewer = useViewer();
const zoom = useZoom();
const root = ref<HTMLElement | null>(null);

// ---- wind ----

const windAvailable = computed(() => viewer.windBinding.value !== null);
const windOn = computed(() => viewer.state.wind.on && windAvailable.value);
const settings = computed(() => viewer.state.wind);
const windOpen = ref(false);

watch(windAvailable, (available) => {
  if (!available) windOpen.value = false;
});

function closeOnOutsidePress(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) windOpen.value = false;
}

watch(windOpen, (open) => {
  if (open) document.addEventListener("pointerdown", closeOnOutsidePress, true);
  else document.removeEventListener("pointerdown", closeOnOutsidePress, true);
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
  <div ref="root" class="tools" @keydown.escape="windOpen = false">
    <div v-if="windOpen" id="wind-panel" class="wind" role="group" aria-label="Wind settings">
      <label class="wind__row wind__row--switch">
        <span class="wind__title">Wind</span>
        <input
          type="checkbox"
          role="switch"
          class="wind__switch"
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
        class="tools__button tools__button--wind"
        :class="{ 'tools__button--active': windOn }"
        :title="windAvailable ? 'Wind settings' : 'This model has no wind data'"
        aria-label="Wind settings"
        :aria-expanded="windOpen"
        aria-controls="wind-panel"
        :disabled="!windAvailable"
        @click="windOpen = !windOpen"
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
