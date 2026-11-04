<script setup lang="ts">
/**
 * The left rail: who this is, the quantities a user can show, and the wind toggle.
 * The map draws a fixed pair, the selected scalar quantity plus wind, so the
 * list is scalar quantities only and wind is a switch beside it.
 */
import { Wind } from "lucide-vue-next";
import { computed } from "vue";
import { useViewer } from "../state/store";
import { iconFor } from "../ui/icons";

const viewer = useViewer();
const orgName = computed(() => viewer.state.catalogue?.config.org_name ?? "");
const selected = computed(() => viewer.state.selection?.quantity ?? null);
const windAvailable = computed(() => viewer.windBinding.value !== null);
</script>

<template>
  <aside class="rail">
    <div class="rail__org">{{ orgName }}</div>
    <div class="rail__list" role="radiogroup" aria-label="Quantity">
      <button
        v-for="q in viewer.scalarQuantities.value"
        :key="q.slug"
        type="button"
        role="radio"
        :aria-checked="q.slug === selected"
        class="rail__item"
        :class="{ 'rail__item--selected': q.slug === selected }"
        @click="viewer.pickQuantity(q.slug)"
      >
        <component :is="iconFor(q.icon)" class="rail__icon" :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span class="rail__label">{{ q.name }}</span>
      </button>
    </div>
    <label class="rail__wind" :class="{ 'rail__wind--off': !windAvailable }">
      <Wind class="rail__icon" :size="18" :stroke-width="1.75" aria-hidden="true" />
      <span class="rail__label">Wind</span>
      <input
        type="checkbox"
        class="rail__switch"
        :checked="viewer.state.windOn && windAvailable"
        :disabled="!windAvailable"
        :title="windAvailable ? 'Wind particles' : 'This model has no wind binding'"
        @change="viewer.setWind(($event.target as HTMLInputElement).checked)"
      />
    </label>
  </aside>
</template>
