import type { DataRow } from "@/lib/insightforge/types";

interface PreviewTableProps {
  rows: DataRow[];
  columns: string[];
  maxRows?: number;
}

export function PreviewTable({ rows, columns, maxRows = 10 }: PreviewTableProps) {
  const display = rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-3 py-2 text-left font-medium uppercase tracking-wide"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map((r, i) => (
            <tr key={i} className="border-t border-border/50">
              {columns.map((c) => (
                <td
                  key={c}
                  className="whitespace-nowrap px-3 py-2 text-foreground/90"
                >
                  {r[c] === null || r[c] === undefined || r[c] === "" ? (
                    <span className="text-muted-foreground/60">—</span>
                  ) : (
                    String(r[c])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <div className="border-t border-border/50 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          Showing first {maxRows} of {rows.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}