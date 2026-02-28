import {
  Joback,
  calcJoback,
  calcJobackHeatCapacity,
  calcJobackProperties,
  createJobackCalculator,
} from "../core/joback";
import {
  JOBACK_FIELD_NAMES,
  JOBACK_GROUP_ALIASES,
  JOBACK_GROUP_METADATA,
  type JobackCalcProp,
  type JobackCategoryMap,
  type JobackEstimatedProperties,
  type JobackGroupCanonicalAlias,
  type JobackGroupFieldName,
  type JobackInputGroups,
  type JobackTableRow,
} from "../types/jb";

type ScalarJobackProperties = Omit<JobackEstimatedProperties, "heat_capacity">;

export interface JobackDocsAPI {
  jobackCalc: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackEstimatedProperties | null;
  jobackPropCalc: (groups: JobackInputGroups, totalAtomsNumber: number) => ScalarJobackProperties | null;
  jobackHeatCapacityCalc: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackCalcProp | null;
  joback_calc: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackEstimatedProperties | null;
  joback_prop_calc: (groups: JobackInputGroups, totalAtomsNumber: number) => ScalarJobackProperties | null;
  joback_heat_capacity_calc: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackCalcProp | null;
}

export function jobackGroupContributionInfo(): [JobackGroupFieldName[], JobackGroupCanonicalAlias[]] {
  return [[...JOBACK_FIELD_NAMES], [...JOBACK_GROUP_ALIASES]];
}

export function jobackGroupContributionNames(): JobackGroupFieldName[] {
  return [...JOBACK_FIELD_NAMES];
}

export function jobackGroupContributionIds(): JobackGroupCanonicalAlias[] {
  return [...JOBACK_GROUP_ALIASES];
}

export function jobackGroupContributionCategory(): JobackCategoryMap {
  const category: JobackCategoryMap = {};
  for (const item of JOBACK_GROUP_METADATA) {
    if (!category[item.category]) category[item.category] = [];
    category[item.category].push({
      group: item.fieldName as JobackGroupFieldName,
      alias: item.canonicalAlias as JobackGroupCanonicalAlias,
    });
  }
  return category;
}

function createDocsWrappers(
  fullCalc: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackEstimatedProperties,
  propsCalc: (groups: JobackInputGroups, totalAtomsNumber: number) => ScalarJobackProperties,
  heatCapacityCalc: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackCalcProp,
): JobackDocsAPI {
  const jobackCalc = (groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties | null => {
    try {
      return fullCalc(groups, totalAtomsNumber);
    } catch {
      return null;
    }
  };

  const jobackPropCalc = (groups: JobackInputGroups, totalAtomsNumber: number): ScalarJobackProperties | null => {
    try {
      return propsCalc(groups, totalAtomsNumber);
    } catch {
      return null;
    }
  };

  const jobackHeatCapacityCalc = (groups: JobackInputGroups, totalAtomsNumber: number): JobackCalcProp | null => {
    try {
      return heatCapacityCalc(groups, totalAtomsNumber);
    } catch {
      return null;
    }
  };

  return {
    jobackCalc,
    jobackPropCalc,
    jobackHeatCapacityCalc,
    joback_calc: jobackCalc,
    joback_prop_calc: jobackPropCalc,
    joback_heat_capacity_calc: jobackHeatCapacityCalc,
  };
}

const defaultDocsWrappers = createDocsWrappers(calcJoback, calcJobackProperties, calcJobackHeatCapacity);

export function jobackCalc(groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties | null {
  return defaultDocsWrappers.jobackCalc(groups, totalAtomsNumber);
}

export function jobackPropCalc(groups: JobackInputGroups, totalAtomsNumber: number): ScalarJobackProperties | null {
  return defaultDocsWrappers.jobackPropCalc(groups, totalAtomsNumber);
}

export function jobackHeatCapacityCalc(groups: JobackInputGroups, totalAtomsNumber: number): JobackCalcProp | null {
  return defaultDocsWrappers.jobackHeatCapacityCalc(groups, totalAtomsNumber);
}

export function createJobackDocs(data: JobackTableRow[]): JobackDocsAPI {
  const calculator = createJobackCalculator(data);
  return createDocsWrappers(calculator.calcJoback, calculator.calcJobackProperties, calculator.calcJobackHeatCapacity);
}

export const joback_group_contribution_info = jobackGroupContributionInfo;
export const joback_group_contribution_names = jobackGroupContributionNames;
export const joback_group_contribution_ids = jobackGroupContributionIds;
export const joback_group_contribution_category = jobackGroupContributionCategory;

export const joback_calc = jobackCalc;
export const joback_prop_calc = jobackPropCalc;
export const joback_heat_capacity_calc = jobackHeatCapacityCalc;

export { Joback };
