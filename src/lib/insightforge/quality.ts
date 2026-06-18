import type {
  ColumnSchema,
  DataRow,
  QualityIssue,
  QualityReport,
} from "./types";

export function computeQuality(
  rows: DataRow[],
  schema: ColumnSchema[],
): QualityReport {
  const totalRows = rows.length;
  const totalCells = totalRows * schema.length || 1;
  const missingCells = schema.reduce((s, c) => s + c.missingCount, 0);
  const missingCellsPct = missingCells / totalCells;

  // duplicates (whole-row)
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (seen.has(k)) duplicateRows++;
    else seen.add(k);
  }

  const issues: QualityIssue[] = [];
  let id = 1;

  for (const col of schema) {
    if (col.missingPct > 0.5) {
      issues.push({
        id: `i${id++}`,
        severity: "high",
        kind: "missing",
        column: col.name,
        message: `“${col.name}” is missing in ${pct(col.missingPct)} of rows.`,
        suggestion: "Drop this column — too sparse to use.",
        action: { type: "drop_column", column: col.name },
        affectedRows: col.missingCount,
      });
    } else if (col.missingPct > 0.05) {
      const action =
        col.inferredType === "numeric"
          ? { type: "impute_median" as const, column: col.name }
          : { type: "impute_mode" as const, column: col.name };
      issues.push({
        id: `i${id++}`,
        severity: "medium",
        kind: "missing",
        column: col.name,
        message: `“${col.name}” has ${pct(col.missingPct)} missing values.`,
        suggestion:
          col.inferredType === "numeric"
            ? "Fill missing values with the column median."
            : "Fill missing values with the most common value.",
        action,
        affectedRows: col.missingCount,
      });
    }

    if (col.uniqueCount <= 1 && totalRows > 1) {
      issues.push({
        id: `i${id++}`,
        severity: "low",
        kind: "constant_column",
        column: col.name,
        message: `“${col.name}” has only one unique value — it carries no signal.`,
        suggestion: "Drop this column.",
        action: { type: "drop_column", column: col.name },
      });
    }

    if (
      (col.inferredType === "categorical" || col.inferredType === "text") &&
      col.uniqueCount > Math.max(50, totalRows * 0.8) &&
      totalRows > 20
    ) {
      issues.push({
        id: `i${id++}`,
        severity: "low",
        kind: "high_cardinality",
        column: col.name,
        message: `“${col.name}” has ${col.uniqueCount} unique values — likely an identifier.`,
        suggestion: "Mark as ID column or drop before modeling.",
        action: { type: "none" },
      });
    }

    if (col.inferredType === "numeric") {
      const outliers = countOutliers(rows, col.name);
      if (outliers > 0 && outliers / totalRows < 0.1) {
        issues.push({
          id: `i${id++}`,
          severity: "low",
          kind: "outliers",
          column: col.name,
          message: `${outliers} possible outlier${outliers === 1 ? "" : "s"} in “${col.name}”.`,
          suggestion:
            "Review these values — they're flagged for inspection, not removed.",
          action: { type: "none" },
          affectedRows: outliers,
        });
      }
    }
  }

  if (duplicateRows > 0) {
    issues.push({
      id: `i${id++}`,
      severity: duplicateRows / totalRows > 0.05 ? "high" : "medium",
      kind: "duplicate_rows",
      message: `${duplicateRows} duplicate row${duplicateRows === 1 ? "" : "s"} detected.`,
      suggestion: "Remove duplicate rows.",
      action: { type: "drop_duplicates" },
      affectedRows: duplicateRows,
    });
  }

  // Score: weighted by completeness, duplication, constants, high-severity issues.
  const completeness = 1 - missingCellsPct;
  const dupPenalty = duplicateRows / totalRows || 0;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const raw =
    100 * completeness - 100 * dupPenalty - 5 * highCount - 1.5 * issues.length;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return { score, totalRows, duplicateRows, missingCellsPct, issues };
}

function countOutliers(rows: DataRow[], column: string): number {
  const nums = rows
    .map((r) => r[column])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (nums.length < 8) return 0;
  const q1 = nums[Math.floor(nums.length * 0.25)];
  const q3 = nums[Math.floor(nums.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return nums.filter((n) => n < lo || n > hi).length;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** Apply a set of cleaning actions to rows + schema. Returns new rows/schema. */
export function applyCleaning(
  rows: DataRow[],
  schema: ColumnSchema[],
  actions: QualityIssue["action"][],
): { rows: DataRow[]; schema: ColumnSchema[]; changesLog: string[] } {
  let next = rows.map((r) => ({ ...r }));
  let nextSchema = schema.map((c) => ({ ...c }));
  const log: string[] = [];

  for (const a of actions) {
    if (a.type === "drop_duplicates") {
      const before = next.length;
      const seen = new Set<string>();
      next = next.filter((r) => {
        const k = JSON.stringify(r);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      log.push(`Removed ${before - next.length} duplicate rows.`);
    } else if (a.type === "drop_column") {
      next = next.map(({ [a.column]: _drop, ...rest }) => rest);
      nextSchema = nextSchema.filter((c) => c.name !== a.column);
      log.push(`Dropped column “${a.column}”.`);
    } else if (a.type === "drop_rows_with_missing") {
      const before = next.length;
      next = next.filter(
        (r) => r[a.column] !== null && r[a.column] !== undefined && r[a.column] !== "",
      );
      log.push(`Dropped ${before - next.length} rows missing “${a.column}”.`);
    } else if (
      a.type === "impute_mean" ||
      a.type === "impute_median" ||
      a.type === "impute_mode"
    ) {
      const col = a.column;
      const present = next
        .map((r) => r[col])
        .filter((v) => v !== null && v !== undefined && v !== "");
      let fill: string | number | boolean | null = null;
      if (a.type === "impute_mean") {
        const nums = present
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n));
        fill = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      } else if (a.type === "impute_median") {
        const nums = present
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n))
          .sort((x, y) => x - y);
        fill = nums.length ? nums[Math.floor(nums.length / 2)] : 0;
      } else {
        const freq = new Map<string, number>();
        for (const v of present) {
          const k = String(v);
          freq.set(k, (freq.get(k) ?? 0) + 1);
        }
        let best: string | undefined;
        let bestN = -1;
        for (const [k, n] of freq) if (n > bestN) ((best = k), (bestN = n));
        fill = best ?? null;
      }
      let filled = 0;
      next = next.map((r) => {
        if (r[col] === null || r[col] === undefined || r[col] === "") {
          filled++;
          return { ...r, [col]: fill };
        }
        return r;
      });
      log.push(`Filled ${filled} missing “${col}” values.`);
    }
  }

  return { rows: next, schema: nextSchema, changesLog: log };
}