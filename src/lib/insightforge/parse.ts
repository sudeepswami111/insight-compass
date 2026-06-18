import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { DataRow } from "./types";

export interface ParsedFile {
  rows: DataRow[];
  columns: string[];
}

const MAX_ROWS = 50_000;

function normalizeRows(raw: Record<string, unknown>[]): DataRow[] {
  return raw.slice(0, MAX_ROWS).map((r) => {
    const out: DataRow = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === undefined || v === null || v === "") out[k] = null;
      else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
      else out[k] = String(v);
    }
    return out;
  });
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return parseCsv(file);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcel(file);
  }
  if (name.endsWith(".json")) {
    return parseJson(file);
  }
  // fallback: try CSV
  return parseCsv(file);
}

function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (res) => {
        const rows = normalizeRows(res.data);
        const columns =
          res.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : []);
        resolve({ rows, columns });
      },
      error: (err) => reject(err),
    });
  });
}

async function parseExcel(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const firstSheet = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheet];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  const rows = normalizeRows(raw);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { rows, columns };
}

async function parseJson(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const data = JSON.parse(text);
  const arr: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown }).data)
      ? ((data as { data: Record<string, unknown>[] }).data)
      : [];
  const rows = normalizeRows(arr);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { rows, columns };
}