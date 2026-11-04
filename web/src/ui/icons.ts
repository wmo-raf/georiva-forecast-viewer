/**
 * The glyph for each icon name the admin can choose.
 *
 * The names are the plugin's curated set (`icons.json` in the plugin package);
 * this map is the web's half of that contract and a test asserts it covers
 * every name. An unknown or blank name draws the fallback, so a bundle older
 * than the plugin never breaks on a name it has not met.
 */

import {
  Circle,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Eye,
  Flame,
  Gauge,
  Haze,
  Mountain,
  Snowflake,
  Sun,
  Thermometer,
  Umbrella,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-vue-next";

export const FALLBACK_ICON: LucideIcon = Circle;

const GLYPHS: Record<string, LucideIcon> = {
  thermometer: Thermometer,
  "cloud-rain": CloudRain,
  "cloud-snow": CloudSnow,
  "cloud-lightning": CloudLightning,
  cloud: Cloud,
  wind: Wind,
  gauge: Gauge,
  droplets: Droplets,
  sun: Sun,
  haze: Haze,
  waves: Waves,
  snowflake: Snowflake,
  mountain: Mountain,
  eye: Eye,
  flame: Flame,
  umbrella: Umbrella,
};

export function iconFor(name: string): LucideIcon {
  return GLYPHS[name] ?? FALLBACK_ICON;
}
