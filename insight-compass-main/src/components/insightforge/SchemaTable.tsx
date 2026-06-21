import type { ColumnSchema, ColumnType } from "@/lib/insightforge/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Hash, Type, Tag, Key, ToggleLeft } from "lucide-react";

const TYPE_META: Record<
  ColumnType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  numeric: { label: "Numeric", icon: Hash },
  categorical: { label: "Category", icon: Tag },
  datetime: { label: "Date/time", icon: Calendar },
  text: { label: "Text", icon: Type },
  id: { label: "Identifier", icon: Key },
  boolean: { label: "Yes/No", icon: ToggleLeft },
};

interface SchemaTableProps {
  schema: ColumnSchema[];
  onTypeChange: (column: string, type: ColumnType) => void;
  targetColumn?: string | null;
  onTargetChange: (column: string | null) => void;
  dateColumn?: string | null;
  onDateChange: (column: string | null) => void;
}

export function SchemaTable({
  schema,
  onTypeChange,
  targetColumn,
  onTargetChange,
  dateColumn,
  onDateChange,
}: SchemaTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Column</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Missing</th>
            <th className="px-3 py-2 text-left font-medium">Unique</th>
            <th className="px-3 py-2 text-left font-medium">Sample</th>
            <th className="px-3 py-2 text-left font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {schema.map((col) => {
            const t = col.overrideType ?? col.inferredType;
            const Icon = TYPE_META[t].icon;
            return (
              <tr
                key={col.name}
                className="border-t border-border/50 hover:bg-muted/20"
              >
                <td className="px-3 py-2 font-medium">{col.name}</td>
                <td className="px-3 py-2">
                  <Select
                    value={t}
                    onValueChange={(v) =>
                      onTypeChange(col.name, v as ColumnType)
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue>
                        <span className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          {TYPE_META[t].label}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_META) as ColumnType[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {TYPE_META[k].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {col.missingCount > 0 ? (
                    <span
                      className={
                        col.missingPct > 0.2
                          ? "text-warning"
                          : "text-muted-foreground"
                      }
                    >
                      {(col.missingPct * 100).toFixed(1)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {col.uniqueCount.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <span className="line-clamp-1 max-w-[260px] text-xs">
                    {col.sample.join(", ") || "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {t === "datetime" && (
                      <button
                        onClick={() =>
                          onDateChange(
                            dateColumn === col.name ? null : col.name,
                          )
                        }
                        className="text-xs"
                      >
                        <Badge
                          variant={
                            dateColumn === col.name ? "default" : "outline"
                          }
                          className={
                            dateColumn === col.name
                              ? "bg-analysis text-analysis-foreground"
                              : ""
                          }
                        >
                          Date axis
                        </Badge>
                      </button>
                    )}
                    {(t === "numeric" ||
                      t === "boolean" ||
                      t === "categorical") && (
                      <button
                        onClick={() =>
                          onTargetChange(
                            targetColumn === col.name ? null : col.name,
                          )
                        }
                      >
                        <Badge
                          variant={
                            targetColumn === col.name ? "default" : "outline"
                          }
                          className={
                            targetColumn === col.name
                              ? "bg-forecast text-forecast-foreground"
                              : ""
                          }
                        >
                          Target
                        </Badge>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}