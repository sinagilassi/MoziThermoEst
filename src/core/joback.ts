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

function getTableByCanonicalAlias(): Map<JobackGroupCanonicalAlias, JobackTableRow> {
  if (tableByCanonicalAliasCache) return tableByCanonicalAliasCache;
  tableByCanonicalAliasCache = new Map(loadJobackTable().map((row) => [row.group, row]));
  return tableByCanonicalAliasCache;
}

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

export function loadJobackTable(): JobackTableRow[] {
  if (!jobackTableCache) {
    jobackTableCache = parseJobackCsv();
  }
  return jobackTableCache.map((row) => ({ ...row }));
}

export function listAvailableJobackGroups(): JobackGroupCanonicalAlias[] {
  return [...JOBACK_GROUP_ALIASES];
}

export function calcJobackProperties(groups: JobackInputGroups, totalAtomsNumber: number): ScalarJobackProperties {
  const total = validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(groups);
  const sigma = calcSigma(validGroups);
  return calcScalarProperties(sigma, total);
}

export function calcJobackHeatCapacity(groups: JobackInputGroups, totalAtomsNumber: number): JobackCalcProp {
  validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(groups);
  const sigma = calcSigma(validGroups);
  return calcHeatCapacityProp(sigma);
}

export function calcJoback(groups: JobackInputGroups, totalAtomsNumber: number): JobackEstimatedProperties {
  const total = validateTotalAtomsNumber(totalAtomsNumber);
  const validGroups = resolveGroups(groups);
  const sigma = calcSigma(validGroups);
  return {
    ...calcScalarProperties(sigma, total),
    heat_capacity: calcHeatCapacityProp(sigma),
  };
}

export class Joback {
  private readonly totalAtomsNumber: number;

  private readonly _validGroups: JobackValidGroupData[];

  constructor(groups: JobackInputGroups, totalAtomsNumber: number) {
    this.totalAtomsNumber = validateTotalAtomsNumber(totalAtomsNumber);
    this._validGroups = resolveGroups(groups);
  }

  get groupContributionIndex(): Record<number, JobackGroupCanonicalAlias> {
    const entries = JOBACK_GROUP_ALIASES.map((alias, idx) => [idx, alias] as const);
    return Object.fromEntries(entries);
  }

  get validGroups(): JobackValidGroupData[] {
    return this._validGroups.map((item) => ({ ...item, data: { ...item.data } }));
  }

  listAvailableGroups(): JobackGroupCanonicalAlias[] {
    return listAvailableJobackGroups();
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
