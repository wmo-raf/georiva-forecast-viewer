/**
 * The viewer's state, as one composable the components share.
 *
 * Loading order follows the user's choices: the catalogue once, then for the
 * selected source its runs and EDR description, then the texture of the
 * current step. The rules live in `selection.ts` and `timeline.ts`; this file
 * only sequences the loads and keeps the latest answer.
 */

import { computed, reactive, watch } from "vue";
import { encodedPreviewUrl } from "../api/addresses";
import { loadCatalogue, loadEdr, loadRuns } from "../api/client";
import type { Catalogue, EdrCollection, EdrParameter, Source } from "../api/types";
import { initialSelection, selectQuantity, selectSource, sourceOf, type Selection } from "./selection";
import { buildTimeline, stepIndex, type Timeline } from "./timeline";

export type Status = "loading" | "ready" | "empty" | "error";

interface State {
  /** The catalogue load: the map exists once this is `ready` or `empty`. */
  status: Status;
  error: string | null;
  /** A failed runs/EDR load for the selected source; the map stays up. */
  sourceError: string | null;
  catalogue: Catalogue | null;
  selection: Selection | null;
  /** The source the timeline below describes; stale while a switch loads. */
  timelineFor: string | null;
  timeline: Timeline | null;
  edr: EdrCollection | null;
  step: number;
  playing: boolean;
}

const state = reactive<State>({
  status: "loading",
  error: null,
  sourceError: null,
  catalogue: null,
  selection: null,
  timelineFor: null,
  timeline: null,
  edr: null,
  step: 0,
  playing: false,
});

/** One source's identity across the catalogue: a quantity switch to the same collection keeps its timeline. */
const keyOf = (source: Source) => `${source.catalog}/${source.collection}`;

const source = computed<Source | undefined>(() =>
  state.catalogue && state.selection ? sourceOf(state.catalogue, state.selection) : undefined,
);

/** False from the moment the source changes until its own timeline has landed. */
const timelineCurrent = computed(() => !!source.value && state.timelineFor === keyOf(source.value));

const run = computed(() => {
  if (!timelineCurrent.value) return null;
  return state.timeline?.runs.find((r) => r.reference_time === state.timeline?.selected) ?? null;
});

const times = computed(() => run.value?.valid_times ?? []);

const time = computed(() => times.value[state.step] ?? null);

/** The scalar variable on the map; vector quantities are the next slice. */
const variable = computed(() => source.value?.variable ?? null);

const parameter = computed<EdrParameter | null>(() =>
  variable.value && state.edr && timelineCurrent.value ? (state.edr.parameter_names[variable.value] ?? null) : null,
);

const textureUrl = computed(() => {
  const org = state.catalogue?.config.org;
  if (!org || !source.value || !variable.value || !time.value || !run.value) return null;
  return encodedPreviewUrl(org, source.value, variable.value, time.value, run.value.reference_time);
});

async function load() {
  state.status = "loading";
  try {
    state.catalogue = await loadCatalogue();
    state.selection = initialSelection(state.catalogue);
    state.status = state.selection ? "ready" : "empty";
  } catch (error) {
    state.status = "error";
    state.error = String(error);
  }
}

/**
 * A source switch loads both routes together. An answer, or a failure, for a
 * source the user has since left is dropped: only the current source may
 * write the timeline or the error.
 */
async function loadSource(current: Source) {
  const stillWanted = () => !!source.value && keyOf(source.value) === keyOf(current);
  try {
    const [runs, edr] = await Promise.all([loadRuns(current), loadEdr(current)]);
    if (!stillWanted()) return;
    state.edr = edr;
    state.timeline = buildTimeline(runs, edr);
    state.timelineFor = keyOf(current);
    state.step = 0;
    state.sourceError = null;
  } catch (error) {
    if (stillWanted()) state.sourceError = String(error);
  }
}

watch(
  source,
  (current) => {
    if (!current || keyOf(current) === state.timelineFor) return;
    state.playing = false;
    void loadSource(current);
  },
  { immediate: true },
);

function pickQuantity(slug: string) {
  if (state.catalogue && state.selection) state.selection = selectQuantity(state.catalogue, state.selection, slug);
}

function pickSource(slug: string) {
  if (state.catalogue && state.selection) state.selection = selectSource(state.catalogue, state.selection, slug);
}

function pickRun(referenceTime: string) {
  if (state.timeline?.runs.some((r) => r.reference_time === referenceTime)) {
    state.timeline.selected = referenceTime;
    state.step = 0;
  }
}

function step(delta: number) {
  state.step = stepIndex(state.step, times.value.length, delta);
}

function setStep(index: number) {
  if (index >= 0 && index < times.value.length) state.step = index;
}

function setPlaying(playing: boolean) {
  state.playing = playing && times.value.length > 1;
}

export function useViewer() {
  return {
    // Shared by reference; components read it and change it only through the actions below.
    state,
    source,
    run,
    times,
    time,
    variable,
    parameter,
    textureUrl,
    load,
    pickQuantity,
    pickSource,
    pickRun,
    step,
    setStep,
    setPlaying,
  };
}
