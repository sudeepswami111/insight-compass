export type ColumnType =
  | "numeric"
  | "categorical"
  | "datetime"
  | "text"
  | "id"
  | "boolean";

export interface ColumnSchema {
  name: string;
  inferredType: ColumnType;
  overrideType?: ColumnType;
  uniqueCount: number;
  missingCount: number;
  missingPct: number;
  sample: string[];
  // numeric-only stats
  min?: number;
  max?: number;
  mean?: number;
}

export interface QualityIssue {
  id: string;
  severity: "low" | "medium" | "high";
  kind:
    | "missing"
    | "duplicate_rows"
    | "outliers"
    | "constant_column"
    | "high_cardinality";
  column?: string;
  message: string;
  suggestion: string;
  action:
    | { type: "impute_mean"; column: string }
    | { type: "impute_median"; column: string }
    | { type: "impute_mode"; column: string }
    | { type: "drop_column"; column: string }
    | { type: "drop_duplicates" }
    | { type: "drop_rows_with_missing"; column: string }
    | { type: "none" };
  affectedRows?: number;
}

export interface QualityReport {
  score: number; // 0-100
  totalRows: number;
  duplicateRows: number;
  missingCellsPct: number;
  issues: QualityIssue[];
}

export type DataRow = Record<string, string | number | boolean | null>;