// Small preview of a file: the first page of a PDF (drawn with pdf.js) or the photo itself.
// Word files and sheets have no preview in the browser, so they get a type icon.
import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon } from "@/components/icons";
import { fileUrl } from "@/lib/fileStore";
import { closePdf, openPdf } from "@/lib/pdfjs";
import { fileExtension } from "@/lib/uploads";
import { cn } from "@/lib/utils";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const RENDER_WIDTH = 120; // px of the drawn page: about twice the shown width, sharp on HiDPI screens
const SIZES = { xs: "h-7 w-5", sm: "h-11 w-8", md: "h-14 w-11" };

const thumbnails = new WeakMap(); // File → Promise<data URL | null>
let queue = Promise.resolve(); // one PDF at a time, so many files do not slow the page down

function renderPdfThumbnail(file) {
  const job = queue.then(async () => {
    let doc = null;
    try {
      doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: RENDER_WIDTH / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    } finally {
      closePdf(doc);
    }
  });
  queue = job;
  return job;
}

/** Data URL of the first page; undefined while drawing, null when the PDF cannot be drawn. */
function usePdfThumbnail(file, enabled) {
  const [state, setState] = useState({ file: null, url: undefined });
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    if (!thumbnails.has(file)) thumbnails.set(file, renderPdfThumbnail(file));
    thumbnails.get(file).then((url) => active && setState({ file, url }));
    return () => {
      active = false;
    };
  }, [file, enabled]);
  return state.file === file ? state.url : undefined;
}

/** `file` may also be just `{ name }` (after a page reload the File object is gone): then only the icon. */
export default function FileThumb({ file, size = "md", className }) {
  const extension = fileExtension(file?.name);
  const readable = typeof file?.arrayBuffer === "function";
  const kind = !readable ? "none" : extension === "pdf" ? "pdf" : IMAGE_EXTENSIONS.has(extension) ? "image" : "none";
  const pdfUrl = usePdfThumbnail(file, kind === "pdf");
  const src = kind === "image" ? fileUrl(file) : kind === "pdf" ? pdfUrl : null;
  const TypeIcon = IMAGE_EXTENSIONS.has(extension) ? ImageIcon : FileText;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white text-primary",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover object-top" />
      ) : kind === "pdf" && pdfUrl === undefined ? (
        <span className="loader loader-sm" aria-hidden="true" />
      ) : (
        <TypeIcon size={size === "md" ? 22 : 14} />
      )}
    </span>
  );
}
