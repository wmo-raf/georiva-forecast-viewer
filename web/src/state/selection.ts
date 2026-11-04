/**
 * Which quantity and which source are on the map.
 *
 * The quantity is the primary selection: the source list is filtered to the
 * sources bound to it, and switching quantity keeps the source when the new
 * quantity has it, else moves to the first that does. Pure functions over the
 * catalogue, so the rule is testable without a component.
 */

import type { Catalogue, Quantity, Source } from "../api/types";

export interface Selection {
  quantity: string;
  source: string;
}

export function quantityOf(catalogue: Catalogue, slug: string): Quantity | undefined {
  return catalogue.quantities.find((q) => q.slug === slug);
}

export function sourcesFor(catalogue: Catalogue, quantity: string): Source[] {
  return quantityOf(catalogue, quantity)?.sources ?? [];
}

export function sourceOf(catalogue: Catalogue, selection: Selection): Source | undefined {
  return sourcesFor(catalogue, selection.quantity).find((s) => s.slug === selection.source);
}

export function initialSelection(catalogue: Catalogue): Selection | null {
  const first = catalogue.quantities[0];
  if (!first || first.sources.length === 0) return null;
  return { quantity: first.slug, source: first.sources[0].slug };
}

export function selectQuantity(catalogue: Catalogue, state: Selection, quantity: string): Selection {
  const sources = sourcesFor(catalogue, quantity);
  if (sources.length === 0) return state;
  const kept = sources.find((s) => s.slug === state.source);
  return { quantity, source: (kept ?? sources[0]).slug };
}

export function selectSource(catalogue: Catalogue, state: Selection, source: string): Selection {
  const offered = sourcesFor(catalogue, state.quantity).some((s) => s.slug === source);
  return offered ? { ...state, source } : state;
}
