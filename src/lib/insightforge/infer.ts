import type { ColumnSchema, ColumnType, DataRow } from "./types";

const DATE_HINTS = /(date|time|day|month|year|created|updated|timestamp|_at\b)/i;
const ID_HINTS = /(^id$|_id$|uuid|guid|email|sku|code|slug)/i;
const NUM_HINTS = /(revenue|price|amount|cost|spend|count|qty|quantity|sales|score|rate|pct|percent)/i;

function isNumericLike(v: unknown): boolean {
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return true;
  return false;
}

function isDateLike(v: unknown): boolean {
  if (v instanceof Date) return !isNaN(v.getTime());
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (s.length < 6 || s.length > 32) return false;
  // ISO-ish or common date strings
  if (!/[\-/:]/.test(s)) return false;
  const t = Date.parse(s);
  return !isNaN(t);
}

function isBoolLike(v: unknown): boolean {
  if (typeof v === "boolean") return true;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return ["true", "false", "yes", "no", "y", "n", "0", "1"].includes(s);
  }
  if (typeof v === "number") return v === 0 || v === 1;
  return false;
}

function inferType(name: string, values: unknown[]): ColumnType {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (present.length === 0) return "text";
  const unique = new Set(present.map((v) => String(v))).size;

  // ID-like by name
  if (ID_HINTS.test(name) && unique / present.length > 0.9) return "id";

  // datetime by name + values
  if (DATE_HINTS.test(name)) {
    const dateHit = present.filter(isDateLike).length / present.length;
    if (dateHit > 0.7) return "datetime";
  } else {
    const dateHit = present.filter(isDateLike).length / present.length;
    if (dateHit > 0.9 && unique > 3) return "datetime";
  }

  // boolean
  if (unique <= 2 && present.every(isBoolLike)) return "boolean";

  // numeric
  const numHit = present.filter(isNumericLike).length / present.length;
  if (numHit > 0.9) {
    // numeric but very low cardinality + name doesn't say numeric → could be categorical code
    if (unique <= 8 && !NUM_HINTS.test(name)) return "categorical";
    return "numeric";
  }

  // categorical vs text
  if (unique <= Math.max(20, present.length * 0.1)) return "categorical";
  return "text";
}

export function inferSchema(
  rows: DataRow[],
  columns: string[],
): ColumnSchema[] {
  return columns.map<ColumnSchema>((name) => {
    const values = rows.map((r) => r[name]);
    const missingCount = values.filter(
      (v) => v === null || v === undefined || v === "",
    ).length;
    const present = values.filter(
      (v): v is string | number | boolean =>
        v !== null && v !== undefined && v !== "",
    );
    const unique = new Set(present.map((v) => String(v))).size;
    const inferredType = inferType(name, values);
    const sample = Array.from(
      new Set(present.slice(0, 100).map((v) => String(v))),
    ).slice(0, 5);

    let min: number | undefined;
    let max: number | undefined;
    let mean: number | undefined;
    if (inferredType === "numeric") {
      const nums = present
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n));
      if (nums.length) {
        min = Math.min(...nums);
        max = Math.max(...nums);
        mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
    }

    return {
      name,
      inferredType,
      uniqueCount: unique,
      missingCount,
      missingPct: rows.length ? missingCount / rows.length : 0,
      sample,
      min,
      max,
      mean,
    };
  });
}

/** Guess best target column (binary classification preferred). */
export function guessTargetColumn(schema: ColumnSchema[]): string | undefined {
  const targetHints = /(churn|target|label|converted|outcome|y|signup|purchase)/i;
  const named = schema.find((c) => targetHints.test(c.name));
  if (named) return named.name;
  const bool = schema.find(
    (c) => c.inferredType === "boolean" && c.missingPct < 0.2,
  );
  return bool?.name;
}

export function guessDateColumn(schema: ColumnSchema[]): string | undefined {
  return schema.find((c) => c.inferredType === "datetime")?.name;
}