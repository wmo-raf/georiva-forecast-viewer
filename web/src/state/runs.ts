/**
 * Naming a model run.
 *
 * Short, because the run sits in the bar beside the step the map is drawing
 * and the two must both fit on a phone: `Wed 4 Nov 03Z`. The weekday is the
 * strip's own, so a run reads against the days below it. Runs start on the
 * hour, so the minutes are left off — unless they are not zero, when leaving
 * them off would give two runs one name. UTC throughout and the module's own
 * names, not the viewer's locale — a reference time shifted into local time
 * would name a run that does not exist.
 */

import { WEEKDAYS } from "./daystrip";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `full` keeps the minutes whatever they are: the run list has the room the
 * bar does not, and there every run reads the same way.
 */
export function formatRun(iso: string, { full = false }: { full?: boolean } = {}): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const time = minutes === "00" && !full ? hours : `${hours}:${minutes}`;
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${time}Z`;
}
