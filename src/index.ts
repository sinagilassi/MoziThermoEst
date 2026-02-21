export type {
  AntoineBase,
  AntoineFitReport,
  AntoineFitResultCompat,
  AntoineLoss,
  CalcVaporPressureOptions,
  CalcVaporPressureResult,
  CalcVaporPressureWithUnitsResult,
  EstimateFromFileOptions,
  EstimateOptions,
  FitAntoineOptions,
  OutlierReportItem,
  OutlierReportOptions,
  PressureUnit,
  RegressionPressureUnit,
  RegressionTemperatureUnit,
  TemperatureUnit,
} from "./types/antoine";
export { Antoine, AntoineError, calcVaporPressure, calcVaporPressureWithUnits, fitAntoine, loadExperimentalData } from "./core/antoine";
export {
  calcVaporPressure as calcVaporPressureLegacy,
  calcVaporPressureWithUnits as calcVaporPressureWithUnitsLegacy,
  estimateCoefficients,
  estimateCoefficientsFromExperimentalData,
  fitAntoine as fitAntoineFromTypedInputs,
} from "./docs/antoine";
