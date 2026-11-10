/**
 * A flag that rises only once its source has held true for `ms`, and drops the
 * moment it goes false.
 *
 * For an indicator of a wait that is usually short: every scrub and playback
 * step loads a texture, and a bar flashing on each of them would be a glitch
 * of its own. Only a wait long enough to notice gets one.
 */

import { onScopeDispose, ref, watch, type Ref } from "vue";

export function delayed(source: Readonly<Ref<boolean>>, ms: number): Readonly<Ref<boolean>> {
  const shown = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  watch(
    source,
    (on) => {
      cancel();
      if (!on) {
        shown.value = false;
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        shown.value = true;
      }, ms);
    },
    { immediate: true },
  );
  onScopeDispose(cancel, true);
  return shown;
}
