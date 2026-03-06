import { readFileSync } from "node:fs";
import {
  Antoine as AntoineCore,
  loadExperimentalDataFromCsvText,
} from "../core/antoine";
import type { PressureUnit, TemperatureUnit } from "../types/antoine";

/**
 * Loads and validates experimental data from a CSV file path in Node.js runtimes.
 */
export function loadExperimentalData(
  experimentalDataPath: string,
  temperatureUnit: TemperatureUnit,
  pressureUnit: PressureUnit,
): { temperaturesK: number[]; pressuresPa: number[] } {
  const raw = readFileSync(experimentalDataPath, "utf8");
  return loadExperimentalDataFromCsvText(raw, temperatureUnit, pressureUnit);
}

/**
 * Node compatibility facade that preserves `Antoine.loadExperimentalData(path, ...)`.
 */
export class Antoine extends AntoineCore {
  static loadExperimentalData(
    experimentalDataPath: string,
    TUnit: TemperatureUnit,
    PUnit: PressureUnit,
  ): { temperaturesK: number[]; pressuresPa: number[] } {
    try {
      return loadExperimentalData(experimentalDataPath, TUnit, PUnit);
    } catch {
      return { temperaturesK: [], pressuresPa: [] };
    }
  }

  static override loadExperimentalDataFromCsvText(
    csvText: string,
    TUnit: TemperatureUnit,
    PUnit: PressureUnit,
  ): { temperaturesK: number[]; pressuresPa: number[] } {
    try {
      return loadExperimentalDataFromCsvText(csvText, TUnit, PUnit);
    } catch {
      return { temperaturesK: [], pressuresPa: [] };
    }
  }
}
