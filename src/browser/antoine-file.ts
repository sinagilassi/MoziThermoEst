import { Antoine as AntoineCore, AntoineError, loadExperimentalDataFromCsvText } from "../core/antoine";
import type { PressureUnit, TemperatureUnit } from "../types/antoine";

const FILE_LOADER_UNAVAILABLE =
  "loadExperimentalData(path, ...) is only available in Node.js. Use loadExperimentalDataFromCsvText(...) on Expo/browser runtimes.";

/**
 * Browser/native fallback that prevents accidental file-system usage.
 */
export function loadExperimentalData(
  _experimentalDataPath: string,
  _temperatureUnit: TemperatureUnit,
  _pressureUnit: PressureUnit,
): { temperaturesK: number[]; pressuresPa: number[] } {
  throw new AntoineError(FILE_LOADER_UNAVAILABLE);
}

/**
 * Browser/native compatibility facade with explicit guidance for file-path loading.
 */
export class Antoine extends AntoineCore {
  static loadExperimentalData(
    _experimentalDataPath: string,
    _TUnit: TemperatureUnit,
    _PUnit: PressureUnit,
  ): { temperaturesK: number[]; pressuresPa: number[] } {
    return { temperaturesK: [], pressuresPa: [] };
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
