<script setup lang="ts">
/**
 * The left rail: the layers a user can show. The map draws the selected
 * scalar quantity with wind and the pressure overlay over it, so the list is
 * scalar quantities only; wind and pressure are the toolbar's, which owns
 * their switches and settings.
 *
 * Above them, when any model can draw it, the Weather layer: Yr symbols over
 * the towns and nothing else (`state/weather.ts`). Always first, under the
 * operator's name for it, and set apart from the quantities by a rule — it is
 * a different kind of map, not another field.
 *
 * It collapses behind a pill that names the quantity on the map. The pill is
 * the only thing that opens or closes it: picking a quantity, Escape and the
 * map all leave it as it is. It starts open on a wide viewport
 * and closed on a narrow one, decided once at load and never stored.
 *
 * Until the catalogue lands the pill and the list are skeletons: the frame is
 * up from the first paint, and they fill in where they stand.
 */
import { ChevronDown, CloudSun } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useViewer } from "../state/store";
import type { Quantity } from "../api/types";
import { isWeather } from "../state/weather";
import { iconFor } from "../ui/icons";

/** Weather's icon is fixed; a quantity's is the operator's choice. */
const glyph = (q: Quantity) => (isWeather(q.slug) ? CloudSun : iconFor(q.icon));

/** The narrow breakpoint, the same one `style.css` switches layout at. */
const NARROW = "(max-width: 720px)";

const viewer = useViewer();
const selected = computed(() => viewer.state.selection?.quantity ?? null);
const selectedQuantity = computed(() => viewer.scalarQuantities.value.find((q) => q.slug === selected.value) ?? null);

const open = ref(typeof window === "undefined" || !window.matchMedia?.(NARROW).matches);
</script>

<template>
  <div class="layers">
    <button
      type="button"
      class="layers__pill"
      :aria-expanded="open"
      aria-controls="layers-menu"
      :title="open ? 'Hide layers' : 'Show layers'"
      @click="open = !open"
    >
      <template v-if="selectedQuantity">
        <component
          :is="glyph(selectedQuantity)"
          class="layers__icon"
          :size="16"
          :stroke-width="1.75"
          aria-hidden="true"
        />
        <span class="layers__name">{{ selectedQuantity.name }}</span>
      </template>
      <span v-else class="skel skel--line layers__skel" aria-label="Loading layers"></span>
      <ChevronDown
        class="layers__chevron"
        :class="{ 'layers__chevron--open': open }"
        :size="16"
        :stroke-width="2"
        aria-hidden="true"
      />
    </button>
    <Transition name="rail">
      <aside v-show="open" id="layers-menu" class="rail">
        <div v-if="!viewer.state.catalogue" class="rail__list" aria-hidden="true">
          <div v-for="n in 4" :key="n" class="rail__item rail__item--skel">
            <span class="skel skel--dot"></span>
            <span class="skel skel--line" :style="{ width: `${[96, 72, 110, 84][n - 1]}px` }"></span>
          </div>
        </div>
        <div v-else class="rail__list" role="radiogroup" aria-label="Layer">
          <template v-for="q in viewer.scalarQuantities.value" :key="q.slug">
            <button
              type="button"
              role="radio"
              :aria-checked="q.slug === selected"
              class="rail__item"
              :class="{ 'rail__item--selected': q.slug === selected }"
              @click="viewer.pickQuantity(q.slug)"
            >
              <component :is="glyph(q)" class="rail__icon" :size="18" :stroke-width="1.75" aria-hidden="true" />
              <span class="rail__label" :title="q.name">{{ q.name }}</span>
            </button>
            <hr v-if="isWeather(q.slug) && viewer.scalarQuantities.value.length > 1" class="rail__separator" />
          </template>
        </div>
      </aside>
    </Transition>
  </div>
</template>
