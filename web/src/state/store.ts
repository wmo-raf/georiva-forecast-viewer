/**
 * The viewer's state, as one composable the components share.
 *
 * Loading order follows the user's choices: the catalogue once, then for the
 * selected source its runs and EDR description, then the texture of the
 * current step. The rules live in `selection.ts` and `timeline.ts`; this file
 * only sequences the loads and keeps the latest answer.
 */

import { computed, reactive, watch } from "vue";
import { encodedPreviewUrl, vectorPreviewUrl } from "../api/addresses";
import { loadCatalogue, loadEdr, loadRuns } from "../api/client";
import type { Catalogue, EdrCollection, EdrParameter, Source } from "../api/types";
import { initialSelection, selectQuantity, selectSource, sourceOf, type Selection } from "./selection";
import { buildTimeline, stepIndex, type Timeline } from "./timeline";
import { DEFAULT_WIND, loadWindSettings, saveWindSettings, type WindSettings } from "./windSettings";

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
  /**
   * How the wind is drawn, from the toolbar's dropup and remembered between
   * visits. `on` is drawn only when the selected source has a wind binding.
   */
  wind: WindSettings;
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
  wind: loadWindSettings(),
});

watch(
  () => ({ ...state.wind }),
  (settings) => saveWindSettings(settings),
);

/** One source's identity across the catalogue: a quantity switch to the same collection keeps its timeline. */
const keyOf = (source: Source) => `${source.catalog}/${source.collection}`;

/**
 * The map shows a fixed pair: one scalar quantity as the raster, plus wind.
 * So the list a user picks from is the scalar quantities, and the selection
 * rules run over that view of the catalogue.
 */
const scalarView = computed<Catalogue | null>(() =>
  state.catalogue
    ? { ...state.catalogue, quantities: state.catalogue.quantities.filter((q) => q.kind === "scalar") }
    : null,
);

const scalarQuantities = computed(() => scalarView.value?.quantities ?? []);

const source = computed<Source | undefined>(() =>
  scalarView.value && state.selection ? sourceOf(scalarView.value, state.selection) : undefined,
);

/** The selected source's wind binding, if the catalogue has a vector quantity bound to it. */
const windBinding = computed<Source | null>(() => {
  const slug = state.selection?.source;
  if (!slug || !state.catalogue) return null;
  for (const quantity of state.catalogue.quantities) {
    if (quantity.kind !== "vector") continue;
    const bound = quantity.sources.find((s) => s.slug === slug);
    if (bound) return bound;
  }
  return null;
});

/** The wind binding the map should draw: the toggle is on and the source has one. Null otherwise. */
const windToDraw = computed<Source | null>(() => (state.wind.on ? windBinding.value : null));

/** False from the moment the source changes until its own timeline has landed. */
const timelineCurrent = computed(() => !!source.value && state.timelineFor === keyOf(source.value));

/**
 * Something the frame is waiting for is on its way: the catalogue, or the
 * selected source's runs and EDR description. The pieces that need it stand in
 * as skeletons at their final size meanwhile, so nothing moves when it lands.
 */
const loading = computed(
  () => state.status === "loading" || (!!source.value && !timelineCurrent.value && !state.sourceError),
);

/** The source's load failed and nothing is coming: skeletons stay, but stop promising. */
const stalled = computed(() => !!state.sourceError && !timelineCurrent.value);

const run = computed(() => {
  if (!timelineCurrent.value) return null;
  return state.timeline?.runs.find((r) => r.reference_time === state.timeline?.selected) ?? null;
});

const times = computed(() => run.value?.valid_times ?? []);

const time = computed(() => times.value[state.step] ?? null);

/** The scalar variable on the map; the wind pair is drawn beside it, from `windToDraw`. */
const variable = computed(() => source.value?.variable ?? null);

const parameter = computed<EdrParameter | null>(() =>
  variable.value && state.edr && timelineCurrent.value ? (state.edr.parameter_names[variable.value] ?? null) : null,
);

const textureUrl = computed(() => {
  const org = state.catalogue?.config.org;
  if (!org || !source.value || !variable.value || !time.value || !run.value) return null;
  return encodedPreviewUrl(org, source.value, variable.value, time.value, run.value.reference_time);
});

/**
 * The wind pair's texture for the same run and step as the raster.
 *
 * `run` and `time` come from the scalar source's timeline, and are the wind's
 * too: a source is one collection, and the wind binding found for the selected
 * source slug is a binding of that same collection, so both quantities are read
 * from one run's items.
 */
const windTextureUrl = computed(() => {
  const org = state.catalogue?.config.org;
  const wind = windToDraw.value;
  // Both components, explicitly: the admin cannot save a vector binding with
  // one of them missing, but a catalogue that somehow carried one would throw
  // out of this computed and take the map down with it. No wind is the honest
  // answer to half a pair.
  if (!org || !wind?.u || !wind.v || !time.value || !run.value) return null;
  return vectorPreviewUrl(org, wind, time.value, run.value.reference_time);
});

async function load() {
  state.status = "loading";
  try {
    state.catalogue = await loadCatalogue();
    state.selection = scalarView.value ? initialSelection(scalarView.value) : null;
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
    // The last source's failure is not this one's.
    state.sourceError = null;
    void loadSource(current);
  },
  { immediate: true },
);

function pickQuantity(slug: string) {
  if (scalarView.value && state.selection) state.selection = selectQuantity(scalarView.value, state.selection, slug);
}

function pickSource(slug: string) {
  if (scalarView.value && state.selection) state.selection = selectSource(scalarView.value, state.selection, slug);
}

/** Changes some of the wind settings; the caller is the dropup, whose controls keep each in range. */
function setWind(changes: Partial<WindSettings>) {
  Object.assign(state.wind, changes);
}

function resetWind() {
  state.wind = { ...DEFAULT_WIND };
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
    scalarQuantities,
    scalarView,
    source,
    windBinding,
    windToDraw,
    timelineCurrent,
    loading,
    stalled,
    run,
    times,
    time,
    variable,
    parameter,
    textureUrl,
    windTextureUrl,
    load,
    pickQuantity,
    pickSource,
    pickRun,
    step,
    setStep,
    setPlaying,
    setWind,
    resetWind,
  };
}
