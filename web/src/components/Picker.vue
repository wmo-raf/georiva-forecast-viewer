<script setup lang="ts">
defineProps<{
  label: string;
  options: { value: string; label: string }[];
  selected: string | null;
}>();
const emit = defineEmits<{ pick: [value: string] }>();
</script>

<template>
  <div class="picker">
    <div class="picker__label">{{ label }}</div>
    <div class="picker__options" role="radiogroup" :aria-label="label">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        role="radio"
        :aria-checked="option.value === selected"
        class="picker__option"
        :class="{ 'picker__option--selected': option.value === selected }"
        @click="emit('pick', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
