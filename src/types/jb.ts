export interface GroupUnit {
  value: number;
}

export interface JobackGroupInfoItem {
  fieldName: string;
  canonicalAlias: string;
  pythonAlias: string;
  id: string;
  category: string;
  type: string;
}

export const JOBACK_GROUP_METADATA = [
  { fieldName: "methyl", canonicalAlias: "-CH3", pythonAlias: "-CH3", id: "NR1", category: "non-ring increments", type: "normal" },
  {
    fieldName: "methylene",
    canonicalAlias: "-CH2- @non-ring",
    pythonAlias: "-CH2- @non-ring",
    id: "NR2",
    category: "non-ring increments",
    type: "normal",
  },
  {
    fieldName: "tertiary_CH",
    canonicalAlias: ">CH- @non-ring",
    pythonAlias: ">CH- @non-ring",
    id: "NR3",
    category: "non-ring increments",
    type: "normal",
  },
  {
    fieldName: "quaternary_C",
    canonicalAlias: ">C< @non-ring",
    pythonAlias: ">C< @non-ring",
    id: "NR4",
    category: "non-ring increments",
    type: "normal",
  },
  { fieldName: "vinyl_CH2", canonicalAlias: "=CH2", pythonAlias: "=CH2", id: "NR5", category: "non-ring increments", type: "normal" },
  {
    fieldName: "vinyl_CH",
    canonicalAlias: "=CH- @non-ring",
    pythonAlias: "=CH- @non-ring",
    id: "NR6",
    category: "non-ring increments",
    type: "normal",
  },
  {
    fieldName: "vinyl_C",
    canonicalAlias: "=C< @non-ring",
    pythonAlias: "=C< @non-ring",
    id: "NR7",
    category: "non-ring increments",
    type: "normal",
  },
  { fieldName: "allene", canonicalAlias: "=C=", pythonAlias: "=C=", id: "NR8", category: "non-ring increments", type: "normal" },
  { fieldName: "alkyne_CH", canonicalAlias: "#CH", pythonAlias: "#CH", id: "NR9", category: "non-ring increments", type: "normal" },
  { fieldName: "alkyne_C", canonicalAlias: "#C-", pythonAlias: "#C-", id: "NR10", category: "non-ring increments", type: "normal" },
  {
    fieldName: "methylene_ring",
    canonicalAlias: "-CH2- @ring",
    pythonAlias: "-CH2- @ring",
    id: "R1",
    category: "ring increments",
    type: "normal",
  },
  {
    fieldName: "tertiary_CH_ring",
    canonicalAlias: ">CH- @ring",
    pythonAlias: ">CH- @ring",
    id: "R2",
    category: "ring increments",
    type: "normal",
  },
  {
    fieldName: "quaternary_C_ring",
    canonicalAlias: ">C< @ring",
    pythonAlias: ">C< @ring",
    id: "R3",
    category: "ring increments",
    type: "normal",
  },
  {
    fieldName: "vinyl_CH_ring",
    canonicalAlias: "=CH- @ring",
    pythonAlias: "=CH- @ring",
    id: "R4",
    category: "ring increments",
    type: "normal",
  },
  {
    fieldName: "vinyl_C_ring",
    canonicalAlias: "=C< @ring",
    pythonAlias: "=C< @ring",
    id: "R5",
    category: "ring increments",
    type: "normal",
  },
  { fieldName: "fluorine", canonicalAlias: "-F", pythonAlias: "-F", id: "H1", category: "hologen increments", type: "normal" },
  { fieldName: "chlorine", canonicalAlias: "-Cl", pythonAlias: "-Cl", id: "H2", category: "hologen increments", type: "normal" },
  { fieldName: "bromine", canonicalAlias: "-Br", pythonAlias: "-Br", id: "H3", category: "hologen increments", type: "normal" },
  { fieldName: "iodine", canonicalAlias: "-I", pythonAlias: "-I", id: "H4", category: "hologen increments", type: "normal" },
  {
    fieldName: "alcohol_OH",
    canonicalAlias: "-OH @alcohol",
    pythonAlias: "-OH @alcohol",
    id: "O1",
    category: "oxygen increments",
    type: "alcohol",
  },
  {
    fieldName: "phenol_OH",
    canonicalAlias: "-OH @phenol",
    pythonAlias: "-OH @phenol",
    id: "O2",
    category: "oxygen increments",
    type: "phenol",
  },
  {
    fieldName: "ether_non_ring",
    canonicalAlias: "-O- @non-ring",
    pythonAlias: "-O- @non-ring",
    id: "O3",
    category: "oxygen increments",
    type: "non-ring",
  },
  {
    fieldName: "ether_ring",
    canonicalAlias: "-O- @ring",
    pythonAlias: "-O- @ring",
    id: "O4",
    category: "oxygen increments",
    type: "ring",
  },
  {
    fieldName: "carbonyl_non_ring",
    canonicalAlias: ">C=O @non-ring",
    pythonAlias: ">C=O @non-ring",
    id: "O5",
    category: "oxygen increments",
    type: "non-ring",
  },
  {
    fieldName: "carbonyl_ring",
    canonicalAlias: ">C=O @ring",
    pythonAlias: ">C=O @ring",
    id: "O6",
    category: "oxygen increments",
    type: "ring",
  },
  {
    fieldName: "aldehyde",
    canonicalAlias: "O=CH- @aldehyde",
    pythonAlias: "O=CH-",
    id: "O7",
    category: "oxygen increments",
    type: "aldehyde",
  },
  {
    fieldName: "carboxylic_acid",
    canonicalAlias: "-COOH @acid",
    pythonAlias: "-COOH",
    id: "O8",
    category: "oxygen increments",
    type: "acid",
  },
  { fieldName: "ester", canonicalAlias: "-COO-", pythonAlias: "-COO-", id: "O9", category: "oxygen increments", type: "ester" },
  {
    fieldName: "carbonyl_other",
    canonicalAlias: "=O",
    pythonAlias: "=O @expect as above",
    id: "O10",
    category: "oxygen increments",
    type: "expect as above",
  },
  { fieldName: "primary_amine", canonicalAlias: "-NH2", pythonAlias: "-NH2", id: "N1", category: "nitrogen increments", type: "normal" },
  {
    fieldName: "secondary_amine_non_ring",
    canonicalAlias: ">NH @non-ring",
    pythonAlias: ">NH @non-ring",
    id: "N2",
    category: "nitrogen increments",
    type: "non-ring",
  },
  {
    fieldName: "secondary_amine_ring",
    canonicalAlias: ">NH @ring",
    pythonAlias: ">NH @ring",
    id: "N3",
    category: "nitrogen increments",
    type: "ring",
  },
  {
    fieldName: "tertiary_amine_non_ring",
    canonicalAlias: ">N- @non-ring",
    pythonAlias: ">N- @non-ring",
    id: "N4",
    category: "nitrogen increments",
    type: "non-ring",
  },
  {
    fieldName: "imine_non_ring",
    canonicalAlias: "-N= @non-ring",
    pythonAlias: "-N= @non-ring",
    id: "N5",
    category: "nitrogen increments",
    type: "non-ring",
  },
  {
    fieldName: "imine_ring",
    canonicalAlias: "-N= @ring",
    pythonAlias: "-N= @ring",
    id: "N6",
    category: "nitrogen increments",
    type: "ring",
  },
  { fieldName: "imine_secondary", canonicalAlias: "=NH", pythonAlias: "=NH", id: "N7", category: "nitrogen increments", type: "normal" },
  { fieldName: "nitrile", canonicalAlias: "-CN", pythonAlias: "-CN", id: "N8", category: "nitrogen increments", type: "normal" },
  { fieldName: "nitro", canonicalAlias: "-NO2", pythonAlias: "-NO2", id: "N9", category: "nitrogen increments", type: "normal" },
  { fieldName: "thiol", canonicalAlias: "-SH", pythonAlias: "-SH", id: "S1", category: "sulfur increments", type: "normal" },
  {
    fieldName: "thioether_non_ring",
    canonicalAlias: "-S- @non-ring",
    pythonAlias: "-S- @non-ring",
    id: "S2",
    category: "sulfur increments",
    type: "non-ring",
  },
  {
    fieldName: "thioether_ring",
    canonicalAlias: "-S- @ring",
    pythonAlias: "-S- @ring",
    id: "S3",
    category: "sulfur increments",
    type: "ring",
  },
] as const satisfies readonly JobackGroupInfoItem[];

export type JobackGroupFieldName = (typeof JOBACK_GROUP_METADATA)[number]["fieldName"];
export type JobackGroupCanonicalAlias = (typeof JOBACK_GROUP_METADATA)[number]["canonicalAlias"];

export type JobackGroupContributionFields = Partial<Record<JobackGroupFieldName, GroupUnit>>;
export type JobackAliasContributionMap = Partial<Record<string, number | GroupUnit>>;
export type JobackInputGroups = JobackGroupContributionFields | JobackAliasContributionMap;

export interface JobackTableRow {
  no: number;
  category: string;
  group: JobackGroupCanonicalAlias;
  type: string;
  id: string;
  Tc: number;
  Pc: number;
  Vc: number;
  Tb: number;
  Tf: number;
  EnFo_IG: number;
  GiEnFo_IG: number;
  a: number;
  b: number;
  c: number;
  d: number;
  EnFus: number;
  EnVap: number;
  "ηa": number;
  "ηb": number;
}

export interface JobackSigma {
  Tc: number;
  Pc: number;
  Vc: number;
  Tb: number;
  Tf: number;
  EnFo_IG: number;
  GiEnFo_IG: number;
  a: number;
  b: number;
  c: number;
  d: number;
  EnFus: number;
  EnVap: number;
}

export interface JobackProp {
  value: number | null;
  unit: string;
  symbol: string;
}

export interface JobackCalcProp {
  value: ((T: number) => number) | null;
  unit: string;
  symbol: string;
}

export interface JobackEstimatedProperties {
  freezing_point_temperature: JobackProp;
  boiling_point_temperature: JobackProp;
  critical_temperature: JobackProp;
  critical_pressure: JobackProp;
  critical_volume: JobackProp;
  standard_enthalpy_of_formation_ideal_gas: JobackProp;
  standard_gibbs_energy_of_formation_ideal_gas: JobackProp;
  standard_enthalpy_of_fusion: JobackProp;
  standard_enthalpy_of_vaporization: JobackProp;
  heat_capacity: JobackCalcProp;
}

export interface JobackValidGroupData {
  fieldName: JobackGroupFieldName;
  canonicalAlias: JobackGroupCanonicalAlias;
  count: number;
  data: JobackTableRow;
}

export type JobackCategoryMap = Record<string, Array<{ group: JobackGroupFieldName; alias: JobackGroupCanonicalAlias }>>;

export const JOBACK_FIELD_NAMES = JOBACK_GROUP_METADATA.map((item) => item.fieldName) as JobackGroupFieldName[];
export const JOBACK_GROUP_ALIASES = JOBACK_GROUP_METADATA.map((item) => item.canonicalAlias) as JobackGroupCanonicalAlias[];

export const JOBACK_PYTHON_ALIAS_NORMALIZATION = {
  "O=CH-": "O=CH- @aldehyde",
  "-COOH": "-COOH @acid",
  "-COO- @ester": "-COO-",
  "=O @expect as above": "=O",
} as const satisfies Record<string, JobackGroupCanonicalAlias>;
