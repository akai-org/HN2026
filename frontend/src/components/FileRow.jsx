import FileThumb from "@/components/FileThumb";
import { fileExtension, formatFileSize } from "@/lib/uploads";
import { cn } from "@/lib/utils";

/**
 * One uploaded file: small preview with the type, name and size. `children` go under the name,
 * `action` on the right, `leading` on the left (e.g. a checkbox). Other props go to the row element.
 * `file` may also be just `{ name }` when the File object is gone (after a page reload).
 */
export default function FileRow({ file, action, leading, className, children, ...props }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-lg border bg-background p-4", className)} {...props}>
      {leading}
      <span className="relative shrink-0">
        <FileThumb file={file} />
        <span className="absolute -right-1.5 -bottom-1 rounded-sm bg-primary px-1 py-0.5 text-[9px] leading-none font-bold text-primary-foreground">
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
