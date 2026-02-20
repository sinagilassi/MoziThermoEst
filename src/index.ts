export type {
  AntoineBase,
  AntoineFitResult,
  AntoineLoss,
  FitAntoineOptions,
  OutlierReportItem,
  PressureUnit,
  TemperatureUnit,
} from "./types/antoine";
export { Antoine } from "./core/antoine";
export { calcVaporPressure, estimateCoefficients, estimateCoefficientsFromExperimentalData } from "./docs/antoine";
