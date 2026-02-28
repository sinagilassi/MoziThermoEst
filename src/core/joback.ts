import { readFileSync } from "node:fs";
import { parseCsvLine } from "../utils/tools";
import {
  JOBACK_FIELD_NAMES,
  JOBACK_GROUP_ALIASES,
  JOBACK_GROUP_METADATA,
  JOBACK_PYTHON_ALIAS_NORMALIZATION,
  type GroupUnit,
  type JobackCalcProp,
  type JobackEstimatedProperties,
  type JobackGroupCanonicalAlias,
  type JobackGroupFieldName,
  type JobackInputGroups,
  type JobackProp,
  type JobackSigma,
  type JobackTableRow,
  type JobackValidGroupData,
} from "../types/jb";

type ScalarJobackProperties = Omit<JobackEstimatedProperties, "heat_capacity">;

const SIGMA_KEYS = ["Tc", "Pc", "Vc", "Tb", "Tf", "EnFo_IG", "GiEnFo_IG", "a", "b", "c", "d", "EnFus", "EnVap"] as const;

type SigmaKey = (typeof SIGMA_KEYS)[number];

let jobackTableCache: JobackTableRow[] | null = null;
let tableByCanonicalAliasCache: Map<JobackGroupCanonicalAlias, JobackTableRow> | null = null;

const metadataByFieldName = new Map<JobackGroupFieldName, (typeof JOBACK_GROUP_METADATA)[number]>(
  JOBACK_GROUP_METADATA.map((item) => [item.fieldName, item]),
);
const metadataByCanonicalAlias = new Map<JobackGroupCanonicalAlias, (typeof JOBACK_GROUP_METADATA)[number]>(
  JOBACK_GROUP_METADATA.map((item) => [item.canonicalAlias, item]),
);

const aliasToCanonical = new Map<string, JobackGroupCanonicalAlias>(
  JOBACK_GROUP_METADATA.flatMap((item) => {
    const entries: Array<[string, JobackGroupCanonicalAlias]> = [[item.canonicalAlias, item.canonicalAlias]];
    if (item.pythonAlias !== item.canonicalAlias) entries.push([item.pythonAlias, item.canonicalAlias]);
    return entries;
  }),
);

for (const [from, to] of Object.entries(JOBACK_PYTHON_ALIAS_NORMALIZATION)) {
  aliasToCanonical.set(from, to);
}

export class JobackError extends Error {
  /**
   * Creates a domain-specific Joback error.
   *
   * @param message - Human-readable explanation of validation or calculation failure.
   */
  constructor(message: string) {
    super(message);
    this.name = "JobackError";
  }
}

/**
 * Converts unknown input to a finite number or throws.
 *
 * @param value - Candidate numeric value.
 * @param label - Field label used in error messages.
 * @returns Parsed finite number.
 * @throws JobackError When the value cannot be interpreted as finite numeric input.
 */
function asFiniteNumber(value: unknown, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new JobackError(`${label} must be a finite number.`);
  return numeric;
}

/**
 * Parses a group count from either scalar or `{ value }` object forms.
 *
 * @param value - Raw group-count input.
 * @param key - Group key used for contextual error messages.
 * @returns Finite numeric count for the group.
 * @throws JobackError When the shape is unsupported or numeric parsing fails.
 */
function parseGroupCount(value: unknown, key: string): number {
  if (typeof value === "number") return asFiniteNumber(value, `Count for group ${key}`);
  if (typeof value === "object" && value !== null && "value" in value) {
    return asFiniteNumber((value as GroupUnit).value, `Count for group ${key}`);
  }
  throw new JobackError(`Group ${key} must be a number or { value: number }.`);
}

/**
 * Creates an empty sigma accumulator for Joback contribution summation.
 *
 * @returns Zero-initialized sigma object across all supported contribution keys.
 */
function createEmptySigma(): JobackSigma {
  return {
    Tc: 0,
    Pc: 0,
    Vc: 0,
    Tb: 0,
    Tf: 0,
    EnFo_IG: 0,
    GiEnFo_IG: 0,
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    EnFus: 0,
    EnVap: 0,
  };
}

/**
 * Wraps a scalar value into the typed property container used by Joback outputs.
 *
 * @param value - Numeric property value.
 * @param unit - Unit label for the property.
 * @param symbol - Symbolic property identifier.
 * @returns Typed property object with null-safe numeric value.
 */
function toProp(value: number, unit: string, symbol: string): JobackProp {
  return {
    value: Number.isFinite(value) ? value : null,
    unit,
    symbol,
  };
}

/**
 * Normalizes arbitrary alias keys to canonical Joback aliases.
 *
 * @param key - Raw alias key from user input.
 * @returns Canonical alias or `null` when no mapping exists.
 */
function normalizeAlias(key: string): JobackGroupCanonicalAlias | null {
  return aliasToCanonical.get(key.trim()) ?? null;
}

/**
 * Returns a cached lookup map from canonical alias to CSV row.
 *
 * @returns Alias-indexed map of Joback table rows.
 */
function getTableByCanonicalAlias(): Map<JobackGroupCanonicalAlias, JobackTableRow> {
  if (tableByCanonicalAliasCache) return tableByCanonicalAliasCache;
  tableByCanonicalAliasCache = new Map(loadJobackTable().map((row) => [row.group, row]));
  return tableByCanonicalAliasCache;
}

/**
 * Parses and validates the Joback contribution CSV file.
 *
 * The parser enforces schema consistency, numeric coercion, and expected group
 * coverage to protect downstream calculations.
 *
 * @returns Fully parsed Joback contribution table rows.
 * @throws JobackError When file structure, values, or group identity checks fail.
 */
function parseJobackCsv(): JobackTableRow[] {
  const url = new URL("../data/joback.csv", import.meta.url);
  const raw = readFileSync(url, "utf8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 3) throw new JobackError("Joback CSV must include headers, units, and data rows.");

  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ""));
  const rows: JobackTableRow[] = [];

  for (let i = 2; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length !== headers.length) {
      throw new JobackError(`Malformed Joback CSV row at line ${i + 1}.`);
    }

    const rec = Object.fromEntries(headers.map((header, idx) => [header, cols[idx]])) as Record<string, string>;
    const group = rec.Group as JobackGroupCanonicalAlias;
    if (!metadataByCanonicalAlias.has(group)) {
      throw new JobackError(`Unknown group in Joback CSV: ${group}`);
    }

    rows.push({
      no: asFiniteNumber(rec["No."], `Row number at line ${i + 1}`),
      category: rec.Category,
      group,
      type: rec.Type,
      id: rec.Id,
      Tc: asFiniteNumber(rec.Tc, `Tc for ${group}`),
      Pc: asFiniteNumber(rec.Pc, `Pc for ${group}`),
      Vc: asFiniteNumber(rec.Vc, `Vc for ${group}`),
      Tb: asFiniteNumber(rec.Tb, `Tb for ${group}`),
      Tf: asFiniteNumber(rec.Tf, `Tf for ${group}`),
      EnFo_IG: asFiniteNumber(rec.EnFo_IG, `EnFo_IG for ${group}`),
      GiEnFo_IG: asFiniteNumber(rec.GiEnFo_IG, `GiEnFo_IG for ${group}`),
      a: asFiniteNumber(rec.a, `a for ${group}`),
      b: asFiniteNumber(rec.b, `b for ${group}`),
      c: asFiniteNumber(rec.c, `c for ${group}`),
      d: asFiniteNumber(rec.d, `d for ${group}`),
      EnFus: asFiniteNumber(rec.EnFus, `EnFus for ${group}`),
      EnVap: asFiniteNumber(rec.EnVap, `EnVap for ${group}`),
      "ηa": asFiniteNumber(rec["ηa"], `ηa for ${group}`),
      "ηb": asFiniteNumber(rec["ηb"], `ηb for ${group}`),
    });
  }

  if (rows.length !== 41) {
    throw new JobackError(`Joback CSV expected 41 groups, received ${rows.length}.`);
  }
  return rows;
}

/**
 * Resolves user-supplied group entries to validated canonical group data.
 *
 * Supports field-name and alias keys, merges duplicate canonical aliases, and
 * removes zero-count entries.
 *
 * @param groups - Raw group contributions object.
 * @returns Array of validated canonical group records with associated table rows.
 * @throws JobackError When groups are invalid, unknown, or empty after filtering.
 */
function resolveGroups(groups: JobackInputGroups): JobackValidGroupData[] {
  if (!groups || typeof groups !== "object") {
    throw new JobackError("groups must be an object.");
  }

  const rowsByAlias = getTableByCanonicalAlias();
  const resolved = new Map<JobackGroupCanonicalAlias, JobackValidGroupData>();

  for (const [rawKey, rawValue] of Object.entries(groups)) {
    const key = rawKey.trim();
    const count = parseGroupCount(rawValue, rawKey);
    if (count < 0) throw new JobackError(`Count for group ${rawKey} must be >= 0.`);
    if (count === 0) continue;

    let canonicalAlias: JobackGroupCanonicalAlias | null = null;
    let fieldName: JobackGroupFieldName | null = null;

    if (metadataByFieldName.has(key as JobackGroupFieldName)) {
      const meta = metadataByFieldName.get(key as JobackGroupFieldName)!;
      canonicalAlias = meta.canonicalAlias;
      fieldName = meta.fieldName as JobackGroupFieldName;
    } else {
      canonicalAlias = normalizeAlias(key);
      if (canonicalAlias) {
        const meta = metadataByCanonicalAlias.get(canonicalAlias)!;
        fieldName = meta.fieldName as JobackGroupFieldName;
      }
    }

    if (!canonicalAlias || !fieldName) {
      throw new JobackError(`Unknown Joback group: ${rawKey}`);
    }

    const row = rowsByAlias.get(canonicalAlias);
    if (!row) throw new JobackError(`No Joback CSV row found for group ${canonicalAlias}.`);

    const prev = resolved.get(canonicalAlias);
    resolved.set(canonicalAlias, {
      fieldName,
      canonicalAlias,
      count: (prev?.count ?? 0) + count,
      data: row,
    });
  }

  if (resolved.size === 0) {
    throw new JobackError("No valid non-zero Joback group contributions were provided.");
  }
  return [...resolved.values()];
}

/**
 * Computes Joback sigma sums from validated group contributions.
 *
 * @param validGroups - Canonical groups with counts and table contributions.
 * @returns Aggregated sigma values used by property equations.
 */
function calcSigma(validGroups: JobackValidGroupData[]): JobackSigma {
  const sigma = createEmptySigma();
  for (const group of validGroups) {
    for (const key of SIGMA_KEYS) {
      sigma[key] += group.count * group.data[key];
    }
  }
  return sigma;
}

/**
 * Builds the ideal-gas heat-capacity correlation property from sigma values.
 *
 * @param sigma - Aggregated Joback sigma terms.
 * @returns Heat-capacity property where `value(T)` evaluates $C_p^{IG}(T)$.
 */
function calcHeatCapacityProp(sigma: JobackSigma): JobackCalcProp {
  const cp = (T: number): number => {
    const t = asFiniteNumber(T, "Temperature");
    return (sigma.a - 37.93) + (sigma.b + 0.210) * t + (sigma.c - 3.91e-4) * t ** 2 + (sigma.d + 2.06e-7) * t ** 3;
  };
  return {
    value: cp,
    unit: "J/mol·K",
    symbol: "Cp_IG",
  };
}

/**
 * Computes scalar Joback properties from sigma and atom-count inputs.
 *
 * Scalar properties include critical constants, transition temperatures, and
 * standard thermochemical values, excluding heat-capacity correlation.
 *
 * @param sigma - Aggregated Joback sigma terms.
 * @param totalAtomsNumber - Total number of atoms in the molecule.
 * @returns Scalar estimated properties with units and symbols.
 */
function calcScalarProperties(sigma: JobackSigma, totalAtomsNumber: number): ScalarJobackProperties {
  const TbValue = 198.2 + sigma.Tb;
  const TcDenominator = 0.584 + 0.965 * sigma.Tc - sigma.Tc ** 2;
  const PcBase = 0.113 + 0.0032 * totalAtomsNumber - sigma.Pc;

  return {
    freezing_point_temperature: toProp(122.5 + sigma.Tf, "K", "Tf"),
    boiling_point_temperature: toProp(TbValue, "K", "Tb"),
    critical_temperature: toProp(TbValue / TcDenominator, "K", "Tc"),
    critical_pressure: toProp(PcBase ** -2, "bar", "Pc"),
    critical_volume: toProp(17.5 + sigma.Vc, "cm3/mol", "Vc"),
    standard_enthalpy_of_formation_ideal_gas: toProp(68.29 + sigma.EnFo_IG, "kJ/mol", "EnFo_IG"),
    standard_gibbs_energy_of_formation_ideal_gas: toProp(53.88 + sigma.GiEnFo_IG, "kJ/mol", "GiEnFo_IG"),
    standard_enthalpy_of_fusion: toProp(-0.88 + sigma.EnFus, "kJ/mol", "EnFus"),
    standard_enthalpy_of_vaporization: toProp(15.3 + sigma.EnVap, "kJ/mol", "EnVap"),
  };
}

/**
 * Validates total atom count required by Joback equations.
 *
 * @param totalAtomsNumber - Candidate total atom count.
 * @returns Validated positive atom count.
 * @throws JobackError When the value is non-finite or not strictly positive.
 */
function validateTotalAtomsNumber(totalAtomsNumber: number): number {
  const total = asFiniteNumber(totalAtomsNumber, "totalAtomsNumber");
  if (total <= 0) throw new JobackError("totalAtomsNumber must be > 0.");
  return total;
}

/**
 * Loads the canonical Joback group contribution table.
 *
 * The table is parsed once and cached; each call returns a cloned array to
 * prevent accidental external mutation of cached records.
 *
 * @returns Parsed Joback table rows.
 */
export function loadJobackTable(): JobackTableRow[] {
  if (!jobackTableCache) {
    jobackTableCache = parseJobackCsv();
  }
  return jobackTableCache.map((row) => ({ ...row }));
}

/**
 * Lists all canonical Joback group aliases available in the library.
 *
 * @returns Array of canonical group aliases.
 */
export function listAvailableJobackGroups(): JobackGroupCanonicalAlias[] {
  return [...JOBACK_GROUP_ALIASES];
}

/**
 * Estimates scalar Joback properties for a molecule.
 *
 * @param groups - Group contribution counts keyed by supported group names or aliases.
 * @param totalAtomsNumber - Total number of atoms in the target molecule.
 * @returns Scalar property estimates (excluding heat capacity).
 * @throws JobackError When atom count or group inputs are invalid.
 */
export function calcJobackProperties(groups: JobackInputGroups, totalAtomsNumber: number): ScalarJobackProperties {
  const total = validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(groups);
  const sigma = calcSigma(validGroups);
  return calcScalarProperties(sigma, total);
}

/**
 * Estimates ideal-gas heat-capacity correlation coefficients via Joback method.
 *
 * @param groups - Group contribution counts keyed by supported group names or aliases.
 * @param totalAtomsNumber - Total number of atoms in the target molecule.
 * @returns Heat-capacity property containing a temperature-dependent function.
 * @throws JobackError When atom count or group inputs are invalid.
 */
export function calcJobackHeatCapacity(groups: JobackInputGroups, totalAtomsNumber: number): JobackCalcProp {
  validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(groups);
  const sigma = calcSigma(validGroups);
  return calcHeatCapacityProp(sigma);
}

/**
 * Estimates full Joback property set including heat capacity.
 *
 * @param groups - Group contribution counts keyed by supported group names or aliases.
 * @param totalAtomsNumber - Total number of atoms in the target molecule.
 * @returns Full estimated property bundle.
 * @throws JobackError When atom count or group inputs are invalid.
 */
export function calcJoback(groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties {
  const total = validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(groups);
  const sigma = calcSigma(validGroups);
  return {
    ...calcScalarProperties(sigma, total),
    heat_capacity: calcHeatCapacityProp(sigma),
  };
}

/**
 * Object-oriented Joback calculator with cached validated inputs.
 */
export class Joback {
  private readonly totalAtomsNumber: number;

  private readonly _validGroups: JobackValidGroupData[];

  /**
   * Creates a Joback calculator instance.
   *
   * @param groups - Group contribution counts keyed by supported group names or aliases.
   * @param totalAtomsNumber - Total number of atoms in the target molecule.
   */
  constructor(groups: JobackInputGroups, totalAtomsNumber: number) {
    this.totalAtomsNumber = validateTotalAtomsNumber(totalAtomsNumber);
    this._validGroups = resolveGroups(groups);
  }

  /**
   * Returns an index map for canonical group aliases.
   *
   * @returns Record mapping zero-based index to canonical alias.
   */
  get groupContributionIndex(): Record<number, JobackGroupCanonicalAlias> {
    const entries = JOBACK_GROUP_ALIASES.map((alias, idx) => [idx, alias] as const);
    return Object.fromEntries(entries);
  }

  /**
   * Returns validated group inputs with defensive copies.
   *
   * @returns Resolved group contribution records.
   */
  get validGroups(): JobackValidGroupData[] {
    return this._validGroups.map((item) => ({ ...item, data: { ...item.data } }));
  }

  /**
   * Lists all canonical groups supported by this implementation.
   *
   * @returns Canonical alias list.
   */
  listAvailableGroups(): JobackGroupCanonicalAlias[] {
    return listAvailableJobackGroups();
  }

  /**
   * Calculates scalar Joback properties using the instance state.
   *
   * @returns Scalar estimated properties (excluding heat capacity).
   */
  calcProperties(): ScalarJobackProperties {
    const sigma = calcSigma(this._validGroups);
    return calcScalarProperties(sigma, this.totalAtomsNumber);
  }

  /**
   * Calculates the Joback heat-capacity correlation using the instance state.
   *
   * @returns Heat-capacity property with temperature-dependent evaluator.
   */
  calcHeatCapacity(): JobackCalcProp {
    const sigma = calcSigma(this._validGroups);
    return calcHeatCapacityProp(sigma);
  }

  /**
   * Calculates full Joback properties including heat capacity.
   *
   * @returns Full estimated property bundle.
   */
  calc(): JobackEstimatedProperties {
    const sigma = calcSigma(this._validGroups);
    return {
      ...calcScalarProperties(sigma, this.totalAtomsNumber),
      heat_capacity: calcHeatCapacityProp(sigma),
    };
  }
}

export type { ScalarJobackProperties };
