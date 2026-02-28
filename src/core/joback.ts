import { DEFAULT_JOBACK_TABLE } from "../data/joback.table";
import {
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
const TABLE_NUMERIC_KEYS = ["no", ...SIGMA_KEYS, "ηa", "ηb"] as const;

type JobackBoundClass = new (groups: JobackInputGroups, totalAtomsNumber: number) => Joback;

export interface JobackCalculator {
  loadJobackTable: () => JobackTableRow[];
  listAvailableJobackGroups: () => JobackGroupCanonicalAlias[];
  calcJobackProperties: (groups: JobackInputGroups, totalAtomsNumber: number) => ScalarJobackProperties;
  calcJobackHeatCapacity: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackCalcProp;
  calcJoback: (groups: JobackInputGroups, totalAtomsNumber: number) => JobackEstimatedProperties;
  Joback: JobackBoundClass;
}

interface JobackContext {
  tableRows: JobackTableRow[];
  tableByCanonicalAlias: Map<JobackGroupCanonicalAlias, JobackTableRow>;
}

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
  constructor(message: string) {
    super(message);
    this.name = "JobackError";
  }
}

function asFiniteNumber(value: unknown, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new JobackError(`${label} must be a finite number.`);
  return numeric;
}

function parseGroupCount(value: unknown, key: string): number {
  if (typeof value === "number") return asFiniteNumber(value, `Count for group ${key}`);
  if (typeof value === "object" && value !== null && "value" in value) {
    return asFiniteNumber((value as GroupUnit).value, `Count for group ${key}`);
  }
  throw new JobackError(`Group ${key} must be a number or { value: number }.`);
}

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

function toProp(value: number, unit: string, symbol: string): JobackProp {
  return {
    value: Number.isFinite(value) ? value : null,
    unit,
    symbol,
  };
}

function normalizeAlias(key: string): JobackGroupCanonicalAlias | null {
  return aliasToCanonical.get(key.trim()) ?? null;
}

function validateAndCloneTable(data: JobackTableRow[]): JobackTableRow[] {
  if (!Array.isArray(data)) throw new JobackError("Joback data must be an array of rows.");
  if (data.length !== JOBACK_GROUP_ALIASES.length) {
    throw new JobackError(`Joback table expected ${JOBACK_GROUP_ALIASES.length} groups, received ${data.length}.`);
  }

  const seen = new Set<JobackGroupCanonicalAlias>();
  const rows = data.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new JobackError(`Joback row ${index + 1} must be an object.`);
    }

    const group = row.group as JobackGroupCanonicalAlias;
    if (!metadataByCanonicalAlias.has(group)) {
      throw new JobackError(`Unknown group in Joback data: ${String((row as { group?: unknown }).group)}`);
    }
    if (seen.has(group)) {
      throw new JobackError(`Duplicate group in Joback data: ${group}`);
    }
    seen.add(group);

    const cloned = {
      ...row,
      category: String(row.category),
      group,
      type: String(row.type),
      id: String(row.id),
    } as JobackTableRow;

    for (const key of TABLE_NUMERIC_KEYS) {
      cloned[key] = asFiniteNumber(cloned[key], `${key} for ${group}`) as never;
    }

    return cloned;
  });

  for (const alias of JOBACK_GROUP_ALIASES) {
    if (!seen.has(alias)) throw new JobackError(`Missing group in Joback data: ${alias}`);
  }

  return rows;
}

function createJobackContext(data: JobackTableRow[]): JobackContext {
  const tableRows = validateAndCloneTable(data);
  const tableByCanonicalAlias = new Map(tableRows.map((row) => [row.group, row]));
  return { tableRows, tableByCanonicalAlias };
}

function loadJobackTableFromContext(context: JobackContext): JobackTableRow[] {
  return context.tableRows.map((row) => ({ ...row }));
}

function resolveGroups(context: JobackContext, groups: JobackInputGroups): JobackValidGroupData[] {
  if (!groups || typeof groups !== "object") {
    throw new JobackError("groups must be an object.");
  }

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

    const row = context.tableByCanonicalAlias.get(canonicalAlias);
    if (!row) throw new JobackError(`No Joback data row found for group ${canonicalAlias}.`);

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

function calcSigma(validGroups: JobackValidGroupData[]): JobackSigma {
  const sigma = createEmptySigma();
  for (const group of validGroups) {
    for (const key of SIGMA_KEYS) {
      sigma[key] += group.count * group.data[key];
    }
  }
  return sigma;
}

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

function validateTotalAtomsNumber(totalAtomsNumber: number): number {
  const total = asFiniteNumber(totalAtomsNumber, "totalAtomsNumber");
  if (total <= 0) throw new JobackError("totalAtomsNumber must be > 0.");
  return total;
}

function listAvailableGroupsFromContext(): JobackGroupCanonicalAlias[] {
  return [...JOBACK_GROUP_ALIASES];
}

function calcJobackPropertiesWithContext(
  context: JobackContext,
  groups: JobackInputGroups,
  totalAtomsNumber: number,
): ScalarJobackProperties {
  const total = validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(context, groups);
  const sigma = calcSigma(validGroups);
  return calcScalarProperties(sigma, total);
}

function calcJobackHeatCapacityWithContext(context: JobackContext, groups: JobackInputGroups, totalAtomsNumber: number): JobackCalcProp {
  validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(context, groups);
  const sigma = calcSigma(validGroups);
  return calcHeatCapacityProp(sigma);
}

function calcJobackWithContext(context: JobackContext, groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties {
  const total = validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(context, groups);
  const sigma = calcSigma(validGroups);
  return {
    ...calcScalarProperties(sigma, total),
    heat_capacity: calcHeatCapacityProp(sigma),
  };
}

function createDataBoundJobackClass(context: JobackContext): JobackBoundClass {
  return class DataBoundJoback extends Joback {
    constructor(groups: JobackInputGroups, totalAtomsNumber: number) {
      super(groups, totalAtomsNumber, context);
    }
  };
}

const defaultContext = createJobackContext(DEFAULT_JOBACK_TABLE);

export function createJobackCalculator(data: JobackTableRow[]): JobackCalculator {
  const context = createJobackContext(data);
  return {
    loadJobackTable: () => loadJobackTableFromContext(context),
    listAvailableJobackGroups: () => listAvailableGroupsFromContext(),
    calcJobackProperties: (groups, totalAtomsNumber) => calcJobackPropertiesWithContext(context, groups, totalAtomsNumber),
    calcJobackHeatCapacity: (groups, totalAtomsNumber) => calcJobackHeatCapacityWithContext(context, groups, totalAtomsNumber),
    calcJoback: (groups, totalAtomsNumber) => calcJobackWithContext(context, groups, totalAtomsNumber),
    Joback: createDataBoundJobackClass(context),
  };
}

export function loadJobackTable(): JobackTableRow[] {
  return loadJobackTableFromContext(defaultContext);
}

export function listAvailableJobackGroups(): JobackGroupCanonicalAlias[] {
  return listAvailableGroupsFromContext();
}

export function calcJobackProperties(groups: JobackInputGroups, totalAtomsNumber: number): ScalarJobackProperties {
  return calcJobackPropertiesWithContext(defaultContext, groups, totalAtomsNumber);
}

export function calcJobackHeatCapacity(groups: JobackInputGroups, totalAtomsNumber: number): JobackCalcProp {
  return calcJobackHeatCapacityWithContext(defaultContext, groups, totalAtomsNumber);
}

export function calcJoback(groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties {
  return calcJobackWithContext(defaultContext, groups, totalAtomsNumber);
}

export class Joback {
  private readonly totalAtomsNumber: number;

  private readonly _validGroups: JobackValidGroupData[];

  private readonly context: JobackContext;

  constructor(groups: JobackInputGroups, totalAtomsNumber: number, context: JobackContext = defaultContext) {
    this.context = context;
    this.totalAtomsNumber = validateTotalAtomsNumber(totalAtomsNumber);
    this._validGroups = resolveGroups(this.context, groups);
  }

  static fromData(data: JobackTableRow[]): JobackBoundClass {
    const context = createJobackContext(data);
    return createDataBoundJobackClass(context);
  }

  get groupContributionIndex(): Record<number, JobackGroupCanonicalAlias> {
    const entries = JOBACK_GROUP_ALIASES.map((alias, idx) => [idx, alias] as const);
    return Object.fromEntries(entries);
  }

  get validGroups(): JobackValidGroupData[] {
    return this._validGroups.map((item) => ({ ...item, data: { ...item.data } }));
  }

  listAvailableGroups(): JobackGroupCanonicalAlias[] {
    return listAvailableGroupsFromContext();
  }

  calcProperties(): ScalarJobackProperties {
    const sigma = calcSigma(this._validGroups);
    return calcScalarProperties(sigma, this.totalAtomsNumber);
  }

  calcHeatCapacity(): JobackCalcProp {
    const sigma = calcSigma(this._validGroups);
    return calcHeatCapacityProp(sigma);
  }

  calc(): JobackEstimatedProperties {
    const sigma = calcSigma(this._validGroups);
    return {
      ...calcScalarProperties(sigma, this.totalAtomsNumber),
      heat_capacity: calcHeatCapacityProp(sigma),
    };
  }
}

export type { ScalarJobackProperties };
