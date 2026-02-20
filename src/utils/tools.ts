/**
 * Clamp a numeric value into a closed interval.
 * @param value Input value.
 * @param low Lower bound.
 * @param high Upper bound.
 * @returns Clamped value in `[low, high]`.
 */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Check whether all values in an array are finite numbers.
 * @param values Input array.
 * @returns `true` when all items are finite numbers.
 */
export function finiteArray(values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

/**
 * Compute Euclidean norm (L2) of a numeric vector.
 * @param values Input vector.
 * @returns Euclidean norm.
 */
export function vecNorm2(values: number[]): number {
  let s = 0;
  for (const v of values) s += v * v;
  return Math.sqrt(s);
}

/**
 * Type guard for finite numeric values.
 * @param value Unknown input.
 * @returns `true` when `value` is a finite number.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parse one CSV row with basic quoted-field handling.
 * @param line CSV line text.
 * @returns Parsed column values.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }

  out.push(cur.trim());
  return out;
}
