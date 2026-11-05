/**
 * Naming a model run.
 *
 * Short, because the run sits in the bar beside the step the map is drawing
 * and the two must both fit on a phone: `4 Nov 03:00Z`. UTC throughout and
 * the module's own month names, not the viewer's locale — a reference time
 * shifted into local time would name a run that does not exist.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatRun(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${hours}:${minutes}Z`;
}
