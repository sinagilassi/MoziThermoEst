import * as mozicuc from "mozicuc";
import type { Pressure, Temperature } from "mozithermodb-settings";
import type { PressureUnit, TemperatureUnit } from "../types/antoine";

const convertFromToFn: (value: number, fromUnit: string, toUnit: string) => number = (() => {
  const mod = mozicuc as unknown as {
    convertFromTo?: (value: number, fromUnit: string, toUnit: string) => number;
    default?: { convertFromTo?: (value: number, fromUnit: string, toUnit: string) => number };
  };
  if (typeof mod.convertFromTo === "function") return mod.convertFromTo;
  if (typeof mod.default?.convertFromTo === "function") return mod.default.convertFromTo;
  throw new Error("mozicuc.convertFromTo is not available");
})();

/**
 * Convert a numeric value from one unit string to another.
 * @param value Numeric value.
 * @param fromUnit Source unit label.
 * @param toUnit Target unit label.
 * @returns Converted value.
 */
export function convertUnit(value: number, fromUnit: string, toUnit: string): number {
  return convertFromToFn(value, fromUnit, toUnit);
}

/**
 * Convert temperature to Kelvin.
 * @param value Temperature value.
 * @param unit Temperature unit.
 * @returns Temperature in Kelvin.
 */
export function toKelvin(value: number, unit: TemperatureUnit): number {
  return convertFromToFn(value, unit, "K");
}

/**
 * Convert pressure to Pascal.
 * @param value Pressure value.
 * @param unit Pressure unit.
 * @returns Pressure in Pascal.
 */
export function toPa(value: number, unit: PressureUnit): number {
  return convertFromToFn(value, unit, "Pa");
}

/**
 * Convert pressure from Pascal into a target pressure unit.
 * @param value Pressure value in Pascal.
 * @param unit Target pressure unit.
 * @returns Converted pressure.
 */
export function fromPa(value: number, unit: PressureUnit): number {
  return convertFromToFn(value, "Pa", unit);
}

/**
 * Normalize typed temperature objects into Kelvin values.
 * Returns `null` when conversion fails.
 * @param temperatures Temperature objects.
 * @returns Array in Kelvin, or `null` when conversion fails.
 */
export function normalizeTemperatures(temperatures: Temperature[]): number[] | null {
  try {
    return temperatures.map((item) => convertFromToFn(item.value, item.unit, "K"));
  } catch {
    return null;
  }
}

/**
 * Normalize typed pressure objects into Pascal values.
 * Returns `null` when conversion fails.
 * @param pressures Pressure objects.
 * @returns Array in Pascal, or `null` when conversion fails.
 */
export function normalizePressures(pressures: Pressure[]): number[] | null {
  try {
    return pressures.map((item) => convertFromToFn(item.value, item.unit, "Pa"));
  } catch {
    return null;
  }
}
