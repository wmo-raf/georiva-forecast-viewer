/**
 * The viewer's state, as one composable the components share.
 *
 * Loading order follows the user's choices: the catalogue once, then for the
 * selected source its runs and EDR description, then the texture of the
 * current step. The rules live in `selection.ts` and `timeline.ts`; this file
 * only sequences the loads and keeps the latest answer.
 */

import { computed, reactive, ref, shallowRef, watch } from "vue";
import { encodedPreviewUrl, vectorPreviewUrl } from "../api/addresses";
import { loadCatalogue, loadEdr, loadPlaces, loadRuns } from "../api/client";
import type { Catalogue, EdrCollection, EdrParameter, PlacesMatrix, Quantity, Source } from "../api/types";
import { extentOf, type Extent } from "../map/framing";
import { symbolsAt } from "../map/symbols";
import { drawnParameter, type Frame } from "./drawn";
import { selectQuantity, selectSource, sourceOf, type Selection } from "./selection";
import { buildTimeline, stepIndex, type Timeline, type TimelineRun } from "./timeline";
import { isWeather, nearestStep, openingSelection, railView } from "./weather";
import {
  loadPressureSettings,
  pressureWanted,
  savePressureSettings,
  type PressureSettings,
} from "./pressureSettings";
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
  /**
   * Which parts of the pressure overlay are drawn, from the toolbar's dropup
   * and remembered between visits. Drawn only when the selected source has a
   * pressure binding.
   */
  pressure: PressureSettings;
  /** In the Weather layer: the selected source's symbols model's town forecasts, once loaded. */
  symbolsMatrix: PlacesMatrix | null;
  symbolsLoading: boolean;
  symbolsFailed: boolean;
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
  pressure: loadPressureSettings(),
  symbolsMatrix: null,
  symbolsLoading: false,
  symbolsFailed: false,
});

watch(
  () => ({ ...state.wind }),
  (settings) => saveWindSettings(settings),
);

watch(
  () => ({ ...state.pressure }),
  (settings) => savePressureSettings(settings),
);


/** One source's identity across the catalogue: a quantity switch to the same collection keeps its timeline. */
const keyOf = (source: Source) => `${source.catalog}/${source.collection}`;

/**
 * What the rail offers and the selection rules run over: the Weather layer
 * first when a source can draw it, then the scalar quantities — each drawn as
 * the raster, with wind and the pressure overlay over it (`state/weather.ts`).
 */
const scalarView = computed<Catalogue | null>(() => (state.catalogue ? railView(state.catalogue) : null));

const scalarQuantities = computed(() => scalarView.value?.quantities ?? []);

/** The scalar quantity on the map. */
const quantity = computed<Quantity | undefined>(() =>
  state.selection ? scalarQuantities.value.find((q) => q.slug === state.selection?.quantity) : undefined,
);

const source = computed<Source | undefined>(() =>
  scalarView.value && state.selection ? sourceOf(scalarView.value, state.selection) : undefined,
);

/** The Weather layer is on the map: symbols, and nothing else. */
const weather = computed(() => isWeather(state.selection?.quantity));

/** The selected source's wind binding, if the catalogue has a vector quantity bound to it. None in Weather. */
const windBinding = computed<Source | null>(() => {
  const slug = state.selection?.source;
  if (!slug || !state.catalogue || weather.value) return null;
  for (const quantity of state.catalogue.quantities) {
    if (quantity.kind !== "vector") continue;
    const bound = quantity.sources.find((s) => s.slug === slug);
    if (bound) return bound;
  }
  return null;
});

/** The wind binding the map should draw: the toggle is on and the source has one. Null otherwise. */
const windToDraw = computed<Source | null>(() => (state.wind.on ? windBinding.value : null));

/**
 * The selected source's pressure overlay, if the organisation named one and
 * this source binds it. Every listing of a source carries it, so the selected
 * scalar's listing is enough.
 */
const pressureOverlay = computed(() => (weather.value ? null : (source.value?.pressure ?? null)));

/** The overlay the map should fetch: something is switched on and the source has one. Null otherwise. */
const pressureToDraw = computed(() => (pressureWanted(state.pressure) ? pressureOverlay.value : null));

/** The Forti model the selected Weather source's symbols come from; blank outside Weather. */
const symbolsModel = computed(() => (weather.value ? (source.value?.symbols_model ?? "") : ""));

/** The loaded symbols are the selected Weather source's. */
const symbolsCurrent = computed(() => !!symbolsModel.value && state.symbolsMatrix?.model === symbolsModel.value);

/**
 * False from the moment the source changes until its own timeline has landed.
 * In Weather the timeline *is* the symbols': the run and times Forti answered for.
 */
const timelineCurrent = computed(() =>
  weather.value ? symbolsCurrent.value : !!source.value && state.timelineFor === keyOf(source.value),
);

/**
 * Something the frame is waiting for is on its way: the catalogue, or the
 * selected source's runs and EDR description. The pieces that need it stand in
 * as skeletons at their final size meanwhile, so nothing moves when it lands.
 */
const failed = computed(() => (weather.value ? state.symbolsFailed : !!state.sourceError));

const loading = computed(
  () => state.status === "loading" || (!!source.value && !timelineCurrent.value && !failed.value),
);

/** The source's load failed and nothing is coming: skeletons stay, but stop promising. */
const stalled = computed(() => failed.value && !timelineCurrent.value);

/**
 * The runs the run picker offers. In Weather, one: the run the symbols were
 * built from — Forti holds a model's latest alone — so the pill reads it and
 * offers no choice.
 */
const runChoices = computed<TimelineRun[]>(() => {
  if (!weather.value) return state.timeline?.runs ?? [];
  const matrix = state.symbolsMatrix;
  return matrix && symbolsCurrent.value ? [{ reference_time: matrix.reference_time, valid_times: matrix.times }] : [];
});

const selectedRun = computed(() =>
  weather.value ? (runChoices.value[0]?.reference_time ?? "") : (state.timeline?.selected ?? ""),
);

const run = computed(() => {
  if (!timelineCurrent.value) return null;
  return runChoices.value.find((r) => r.reference_time === selectedRun.value) ?? null;
});

const times = computed(() => run.value?.valid_times ?? []);

const time = computed(() => times.value[state.step] ?? null);

/** The scalar variable on the map; the wind pair is drawn beside it, from `windToDraw`. */
const variable = computed(() => source.value?.variable ?? null);

const parameter = computed<EdrParameter | null>(() =>
  variable.value && state.edr && timelineCurrent.value ? (state.edr.parameter_names[variable.value] ?? null) : null,
);

/** The selected source's scalar variable: what the frame on screen must be a reading of to be the selection's. */
const selectedScalar = computed(() =>
  source.value && variable.value ? `${source.value.catalog}/${source.value.collection}/${variable.value}` : null,
);

/**
 * The raster frame on screen, as the map reports it each time a texture lands
 * or the raster is cleared. The map is its one writer.
 */
const frame = shallowRef<Frame | null>(null);

/**
 * The parameter the raster is painted with, and the legend drawn from: the
 * frame's own, not the selection's, so a quantity switch repaints only when
 * its texture has landed (`drawn.ts`).
 */
const shownParameter = computed(() => drawnParameter(frame.value, selectedScalar.value, parameter.value));

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

/**
 * The pressure variable's texture for the same run and step as the raster.
 *
 * Keyed by the pressure variable's own token, not the source's: the source
 * listing's `version` is the selected scalar's, and an immutable reply cached
 * under it would keep msl at a range it no longer has. When msl is itself the
 * selected raster, this is the raster's URL, and the browser's cache answers
 * the second fetch.
 */
const pressureTextureUrl = computed(() => {
  const org = state.catalogue?.config.org;
  const pressure = pressureToDraw.value;
  if (!org || !source.value || !pressure || !time.value || !run.value) return null;
  return encodedPreviewUrl(org, source.value, pressure.variable, time.value, run.value.reference_time, pressure.version);
});

/**
 * What a switch frames (`map/framing.ts`): the Weather area while in Weather,
 * the model's EDR extent otherwise — each only once it is the current
 * selection's, so a switch never frames the model it left.
 */
const frameBounds = computed<Extent | null>(() => {
  if (weather.value) return symbolsCurrent.value ? extentOf(state.symbolsMatrix?.bbox) : null;
  if (!source.value || state.timelineFor !== keyOf(source.value) || !state.edr) return null;
  return extentOf(state.edr.extent.spatial.bbox);
});

/**
 * Counts the switches that ask to be framed: another model, and every entry
 * into Weather. Not the opening selection — the viewer opens on the operator's
 * view as set — and not a quantity switch on the same model.
 */
const frameRequests = ref(0);

watch(
  () => [source.value ? keyOf(source.value) : null, weather.value] as const,
  ([key, inWeather], previous) => {
    if (!previous || previous[0] === null) return;
    if (key !== previous[0] || (inWeather && !previous[1])) frameRequests.value++;
  },
);

/** The towns the map draws in Weather at the step on screen; null outside Weather. */
const symbolsToDraw = computed(() =>
  weather.value && symbolsCurrent.value ? symbolsAt(state.symbolsMatrix, time.value) : null,
);

/** Load a Weather source's town forecasts. An answer for a model the user has since left is dropped. */
async function loadSymbols(model: string) {
  state.symbolsLoading = true;
  state.symbolsFailed = false;
  try {
    const matrix = await loadPlaces(model);
    if (symbolsModel.value !== model) return;
    state.symbolsMatrix = matrix;
  } catch {
    if (symbolsModel.value === model) state.symbolsFailed = true;
  } finally {
    if (symbolsModel.value === model) state.symbolsLoading = false;
  }
}

// Every entry into Weather asks again — a newer run may have been published
// since — and so does a switch to another Weather source. The route answers
// from its cache (or a 304), so the ask is cheap.
watch(
  symbolsModel,
  (model) => {
    if (model) void loadSymbols(model);
  },
  { immediate: true },
);

/**
 * The moment on screen when the user last switched between Weather and a
 * raster: their timelines differ, so the step is found again in the new one
 * (`nearestStep`) once it is there, rather than reset to its start.
 */
let carried: string | null = null;

watch(times, (next) => {
  if (carried === null || next.length === 0) return;
  state.step = nearestStep(next, carried);
  carried = null;
});

async function load() {
  state.status = "loading";
  try {
    state.catalogue = await loadCatalogue();
    state.selection = scalarView.value
      ? openingSelection(scalarView.value, state.catalogue.weather?.opens ?? false)
      : null;
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
    // In Weather this is the raster timeline loading behind the symbols, for
    // the switch back; the step on screen is Weather's and stays.
    if (!weather.value) state.step = 0;
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
  if (!scalarView.value || !state.selection) return;
  if (isWeather(slug) !== weather.value) {
    carried = time.value;
    state.playing = false;
  }
  state.selection = selectQuantity(scalarView.value, state.selection, slug);
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

/** Changes some of the pressure switches. */
function setPressure(changes: Partial<PressureSettings>) {
  Object.assign(state.pressure, changes);
}

function pickRun(referenceTime: string) {
  // In Weather there is one run, the symbols', and nothing to pick.
  if (weather.value) return;
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
    quantity,
    source,
    windBinding,
    windToDraw,
    pressureOverlay,
    pressureToDraw,
    timelineCurrent,
    loading,
    stalled,
    run,
    times,
    time,
    variable,
    parameter,
    selectedScalar,
    frame,
    shownParameter,
    textureUrl,
    windTextureUrl,
    pressureTextureUrl,
    weather,
    runChoices,
    selectedRun,
    symbolsToDraw,
    frameBounds,
    frameRequests,
    load,
    pickQuantity,
    pickSource,
    pickRun,
    step,
    setStep,
    setPlaying,
    setWind,
    resetWind,
    setPressure,
  };
}
