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

/**
 * Returns both Joback group field names and canonical alias identifiers.
 *
 * The returned tuple is copied from internal constants so callers can consume
 * or transform these collections without mutating source metadata.
 *
 * @returns A tuple where index `0` is all field names and index `1` is all canonical aliases.
 */
export function jobackGroupContributionInfo(): [JobackGroupFieldName[], JobackGroupCanonicalAlias[]] {
  return [[...JOBACK_FIELD_NAMES], [...JOBACK_GROUP_ALIASES]];
}

/**
 * Returns all supported Joback group field names.
 *
 * This helper is useful for validation, UI option generation, and schema
 * discovery where only the symbolic group names are required.
 *
 * @returns A shallow-copied array of Joback group field-name tokens.
 */
export function jobackGroupContributionNames(): JobackGroupFieldName[] {
  return [...JOBACK_FIELD_NAMES];
}

/**
 * Returns all canonical Joback group aliases.
 *
 * Canonical aliases are stable identifiers aligned with internal metadata and
 * are commonly used for serialization or cross-language compatibility.
 *
 * @returns A shallow-copied array of canonical Joback alias identifiers.
 */
export function jobackGroupContributionIds(): JobackGroupCanonicalAlias[] {
  return [...JOBACK_GROUP_ALIASES];
}

/**
 * Builds a category-indexed view of Joback group metadata.
 *
 * The result maps each category to its associated group descriptors,
 * containing both the field-name token and canonical alias for each entry.
 *
 * @returns A category map of Joback groups grouped by metadata category.
 */
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

/**
 * Estimates full Joback properties from input group counts.
 *
 * This compatibility wrapper catches runtime errors from the canonical
 * implementation and returns `null` instead, which can simplify usage in
 * pipelines that prefer nullable failure signaling over thrown exceptions.
 *
 * @param groups - Group contribution counts keyed by Joback group names.
 * @param totalAtomsNumber - Total number of atoms in the target molecule.
 * @returns Full estimated property set on success, otherwise `null`.
 */
export function jobackCalc(groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties | null {
  try {
    return calcJoback(groups, totalAtomsNumber);
  } catch {
    return null;
  }
}

/**
 * Estimates scalar Joback properties (excluding heat-capacity expression).
 *
 * Internally delegates to the canonical scalar-property routine and converts
 * thrown errors into `null` for legacy-compatible consumers.
 *
 * @param groups - Group contribution counts keyed by Joback group names.
 * @param totalAtomsNumber - Total number of atoms in the target molecule.
 * @returns Estimated scalar properties on success, otherwise `null`.
 */
export function jobackPropCalc(groups: JobackInputGroups, totalAtomsNumber: number): ScalarJobackProperties | null {
  try {
    return calcJobackProperties(groups, totalAtomsNumber);
  } catch {
    return null;
  }
}

/**
 * Estimates the Joback ideal-gas heat-capacity correlation coefficients.
 *
 * This helper wraps the core heat-capacity estimator and normalizes failures
 * to `null` for compatibility with nullable API flows.
 *
 * @param groups - Group contribution counts keyed by Joback group names.
 * @param totalAtomsNumber - Total number of atoms in the target molecule.
 * @returns Heat-capacity correlation parameters on success, otherwise `null`.
 */
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
