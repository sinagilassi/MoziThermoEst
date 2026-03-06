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
export type {
  GroupUnit,
  JobackAliasContributionMap,
  JobackCalcProp,
  JobackCategoryMap,
  JobackEstimatedProperties,
  JobackGroupCanonicalAlias,
  JobackGroupContributionFields,
  JobackGroupFieldName,
  JobackGroupInfoItem,
  JobackInputGroups,
  JobackProp,
  JobackSigma,
  JobackTableRow,
  JobackValidGroupData,
} from "./types/jb";
export { Antoine, AntoineError, calcVaporPressure, calcVaporPressureWithUnits, fitAntoine, loadExperimentalData } from "./core/antoine";
export type { JobackCalculator } from "./core/joback";
export {
  Joback,
  JobackError,
  calcJoback,
  calcJobackHeatCapacity,
  calcJobackProperties,
  createJobackCalculator,
  listAvailableJobackGroups,
  loadJobackTable,
} from "./core/joback";
export { DEFAULT_JOBACK_TABLE } from "./data/joback.table";
export {
  calcVaporPressure as calcVaporPressureLegacy,
  calcVaporPressureWithUnits as calcVaporPressureWithUnitsLegacy,
  estimateCoefficients,
  estimateCoefficientsFromExperimentalData,
  fitAntoine as fitAntoineFromTypedInputs,
} from "./docs/antoine";
export {
  createJobackDocs,
  jobackCalc,
  jobackHeatCapacityCalc,
  type JobackDocsAPI,
  jobackPropCalc,
  jobackGroupContributionCategory,
  jobackGroupContributionIds,
  jobackGroupContributionInfo,
  jobackGroupContributionNames,
  joback_calc,
  joback_group_contribution_category,
  joback_group_contribution_ids,
  joback_group_contribution_info,
  joback_group_contribution_names,
  joback_heat_capacity_calc,
  joback_prop_calc,
} from "./docs/joback";
// NOTE: Utils
export * from "./utils";