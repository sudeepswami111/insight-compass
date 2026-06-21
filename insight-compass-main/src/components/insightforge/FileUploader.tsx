import { useCallback, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  onFile: (file: File) => void | Promise<void>;
  busy?: boolean;
  accept?: string;
}

export function FileUploader({
  onFile,
  busy,
  accept = ".csv,.tsv,.xlsx,.xls,.json",
}: FileUploaderProps) {
  const [drag, setDrag] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      await onFile(files[0]);
    },
    [onFile],
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (busy) return;
        void handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-card/40 px-6 py-14 text-center transition",
        drag && "border-analysis bg-analysis/5",
        busy && "pointer-events-none opacity-70",
      )}
    >
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={busy}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      {busy ? (
        <Loader2 className="h-8 w-8 animate-spin text-analysis" />
      ) : (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-analysis/10 text-analysis">
          <UploadCloud className="h-6 w-6" />
        </div>
      )}
      <p className="mt-4 text-sm font-medium">
        {busy
          ? "Reading your file…"
          : drag
            ? "Drop your file to upload"
            : "Drop a CSV, Excel, or JSON file"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        We'll detect columns, score data quality, and prepare it for analysis.
        Up to 50MB.
      </p>
    </label>
  );
}