import { FileText, Image } from "@/components/icons";
import { fileExtension, formatFileSize } from "@/lib/uploads";
import { cn } from "@/lib/utils";

/**
 * One uploaded file: type icon, name and size. `children` go under the name, `action` on the right.
 * `file` may also be just `{ name }` when the File object is gone (after a page reload).
 */
export default function FileRow({ file, action, className, children }) {
  const TypeIcon = file.type?.startsWith("image/") ? Image : FileText;

  return (
    <div className={cn("flex items-center gap-4 rounded-lg border bg-background p-4", className)}>
      <span className="relative flex size-12 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
        <TypeIcon size={24} />
        <span className="absolute right-1 -bottom-1 rounded-sm bg-primary px-1 py-0.5 text-[9px] leading-none font-bold text-primary-foreground">
          {fileExtension(file.name).toUpperCase() || "PLIK"}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        {file.size !== undefined && (
          <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        )}
        {children}
      </div>
      {action}
    </div>
  );
}
