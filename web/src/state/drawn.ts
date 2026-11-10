/**
 * Which parameter the raster on screen is drawn with.
 *
 * A texture holds values, not colours: what it looks like is decided by the
 * palette it is painted through, and its values make sense only through the
 * palette of the variable they are readings of. The selection moves on the
 * click, but the texture only when the new one lands, so for the length of the
 * fetch the two disagree. Painting the old frame through the newly selected
 * palette is the flash a quantity switch used to show; this rule keeps each
 * frame on its own parameter until the next one replaces it.
 *
 * The legend reads the same answer, so it is a key to what is on the map,
 * never to what is still on its way.
 */

import type { EdrParameter } from "../api/types";

/** The frame on screen: the variable it is a reading of, and its parameter as it was when the frame landed. */
export interface Frame {
  /** `catalog/collection/variable` */
  of: string;
  parameter: EdrParameter | null;
}

/**
 * The frame's own parameter — or, once the frame is a reading of the selected
 * variable, the selected one, so a description that changes under the same
 * variable repaints rather than waiting for the next frame.
 */
export function drawnParameter(
  frame: Frame | null,
  selected: string | null,
  current: EdrParameter | null,
): EdrParameter | null {
  if (!frame) return null;
  if (frame.of === selected && current) return current;
  return frame.parameter;
}
