// Miniatura pliku: zdjęcie, pierwsza strona PDF-a albo ikona z rozszerzeniem.
import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { pdfThumbCache as cache, pdfThumbnail } from "../lib/pdfjs.js";

const TONES = {
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
const BADGE = {
  red: "bg-red-700",
  blue: "bg-blue-700",
  green: "bg-emerald-700",
  teal: "bg-teal-700",
  violet: "bg-violet-700",
};


function usePdfThumb(item) {
  const [thumb, setThumb] = useState(() => (item.type?.kind === "pdf" ? cache.get(item.file) ?? null : null));
  useEffect(() => {
    if (item.type?.kind !== "pdf" || cache.has(item.file)) return undefined;
    let cancelled = false;
    pdfThumbnail(item.file)
      .then((result) => {
        cache.set(item.file, result);
        if (!cancelled) setThumb(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item]);
  return thumb;
}

export default function FileThumb({ item, size = "md" }) {
  const pdf = usePdfThumb(item);
  const tone = item.type?.tone ?? "blue";
  const box = size === "sm" ? "size-10" : "size-12 sm:size-14";
  const src = item.previewUrl ?? pdf?.url;
  const Icon = item.type?.kind === "sheet" ? FileSpreadsheet : FileText;

  return (
    <span className={`relative inline-flex ${box} shrink-0`}>
      {src ? (
        <img src={src} alt="" className="size-full rounded-lg bg-white object-cover object-top ring-1 ring-slate-300" />
      ) : (
        <span className={`flex size-full items-center justify-center rounded-lg ring-1 ${TONES[tone]}`}>
          <Icon aria-hidden="true" size={size === "sm" ? 18 : 22} strokeWidth={1.75} />
        </span>
      )}
      <span
        aria-hidden="true"
        className={`absolute -right-1.5 -bottom-1 rounded px-1 py-px text-[9px] leading-tight font-bold tracking-wide text-white shadow-sm ${BADGE[tone]}`}
      >
        {item.type?.badge ?? "PLIK"}
      </span>
    </span>
  );
}
