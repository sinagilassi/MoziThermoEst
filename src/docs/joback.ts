import {
  Joback,
  calcJoback,
  calcJobackHeatCapacity,
  calcJobackProperties,
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
} from "../types/jb";

type ScalarJobackProperties = Omit<JobackEstimatedProperties, "heat_capacity">;

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

export function jobackCalc(groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties | null {
  try {
    return calcJoback(groups, totalAtomsNumber);
  } catch {
    return null;
  }
}

export function jobackPropCalc(groups: JobackInputGroups, totalAtomsNumber: number): ScalarJobackProperties | null {
  try {
    return calcJobackProperties(groups, totalAtomsNumber);
  } catch {
    return null;
  }
}

export function jobackHeatCapacityCalc(groups: JobackInputGroups, totalAtomsNumber: number): JobackCalcProp | null {
  try {
    return calcJobackHeatCapacity(groups, totalAtomsNumber);
  } catch {
    return null;
  }
}

export const joback_group_contribution_info = jobackGroupContributionInfo;
export const joback_group_contribution_names = jobackGroupContributionNames;
export const joback_group_contribution_ids = jobackGroupContributionIds;
export const joback_group_contribution_category = jobackGroupContributionCategory;

export const joback_calc = jobackCalc;
export const joback_prop_calc = jobackPropCalc;
export const joback_heat_capacity_calc = jobackHeatCapacityCalc;

export { Joback };
