import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { delayed } from "./delayed";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a flag that only rises once it has held", () => {
  it("stays down for a wait shorter than the delay", async () => {
    const busy = ref(false);
    const shown = delayed(busy, 300);
    busy.value = true;
    await nextTick();
    vi.advanceTimersByTime(200);
    busy.value = false;
    await nextTick();
    vi.advanceTimersByTime(500);
    expect(shown.value).toBe(false);
  });

  it("rises once the wait outlasts the delay, and drops the moment it ends", async () => {
    const busy = ref(false);
    const shown = delayed(busy, 300);
    busy.value = true;
    await nextTick();
    vi.advanceTimersByTime(300);
    expect(shown.value).toBe(true);
    busy.value = false;
    await nextTick();
    expect(shown.value).toBe(false);
  });

  it("starts the delay over for each new wait", async () => {
    const busy = ref(true);
    const shown = delayed(busy, 300);
    vi.advanceTimersByTime(250);
    busy.value = false;
    await nextTick();
    busy.value = true;
    await nextTick();
    vi.advanceTimersByTime(250);
    expect(shown.value).toBe(false);
    vi.advanceTimersByTime(50);
    expect(shown.value).toBe(true);
  });
});
