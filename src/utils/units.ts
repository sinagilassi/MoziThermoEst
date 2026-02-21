import * as mozicuc from "mozicuc";
import type { Pressure, Temperature } from "mozithermodb-settings";
import type {
  PressureUnit,
  RegressionPressureUnit,
  RegressionTemperatureUnit,
  TemperatureUnit,
} from "@/types/antoine";

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
    return normalizeTemperaturesToUnit(temperatures, "K");
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
    return normalizePressuresToUnit(pressures, "Pa");
  } catch {
    return null;
  }
}

type UnitValue = { value: number; unit: string };

/**
 * Normalize an array of typed values into a target unit.
 * Throws on empty input, invalid items, or conversion failure.
 */
export function normalizeUnit<T extends UnitValue>(
  values: T[],
  targetUnit: string,
  label: string,
  allowedUnits?: string[],
): number[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  const out: number[] = [];
  for (const item of values) {
    if (!item || !Number.isFinite(item.value) || typeof item.unit !== "string") {
      throw new Error(`${label} entries must include finite value and unit.`);
    }
    if (allowedUnits && !allowedUnits.includes(item.unit)) {
      throw new Error(`${label} unit '${item.unit}' is not supported.`);
    }
    out.push(convertFromToFn(item.value, item.unit, targetUnit));
  }
  return out;
}

/**
 * Normalize typed temperature objects into a target regression unit.
 */
export function normalizeTemperaturesToUnit(
  temperatures: Temperature[],
  unit: RegressionTemperatureUnit,
): number[] {
  return normalizeUnit(temperatures, unit, "temperatures", ["K", "C", "F", "R"]);
}

/**
 * Normalize typed pressure objects into a target regression unit.
 */
export function normalizePressuresToUnit(
  pressures: Pressure[],
  unit: RegressionPressureUnit,
): number[] {
  return normalizeUnit(pressures, unit, "pressures", ["Pa", "kPa", "bar", "atm", "psi"]);
}
