// Opens the original PDF and matches the form's fields to its text (see PdfPage.jsx).
import { useEffect, useMemo, useState } from "react";
import { pdfFieldsOf } from "@/lib/pdfFields";
import { closePdf, openPdf } from "@/lib/pdfjs";
import { createPdfIndex, matchFields } from "@/lib/pdfSearch";

const NO_MATCHES = new Map();

/**
 * Opens the PDF, reads the text of every page and matches the form's fields to it.
 * Returns { doc, error, pdfIndex, matches: Map(id → { page, marks, fromChildren? }), titles: Map(id → title) }.
 */
export default function usePdfOriginal(file, form) {
  const [state, setState] = useState({ file: null, doc: null, pageTexts: null, error: "" });

  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;
    let loaded = null;
    (async () => {
      let doc;
      try {
        doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
      } catch {
        if (!cancelled)
          setState({ file, doc: null, pageTexts: null, error: "Nie udało się otworzyć pliku PDF." });
        return;
      }
      loaded = doc;
      if (cancelled) {
        closePdf(doc);
        return;
      }
      setState({ file, doc, pageTexts: null, error: "" });
      // Text of all pages, once per file: matching needs the whole document (fields keep their order on paper).
      let pages = [];
      try {
        for (let number = 1; number <= doc.numPages; number += 1) {
          const content = await (await doc.getPage(number)).getTextContent();
          if (cancelled) return;
          pages.push({
            items: content.items
              .filter((item) => "str" in item)
              .map((item) => ({ str: item.str, height: item.height })),
          });
        }
      } catch {
        pages = []; // the page is still shown, only without highlighting
      }
      if (!cancelled)
        setState((current) => (current.doc === doc ? { ...current, pageTexts: pages } : current));
    })();
    return () => {
      cancelled = true;
      closePdf(loaded);
    };
  }, [file]);

  const current = state.file === file ? state : { doc: null, pageTexts: null, error: "" };
  const pdfIndex = useMemo(
    () => (current.pageTexts ? createPdfIndex(current.pageTexts) : null),
    [current.pageTexts],
  );

  // Re-matched only when titles or the layout of fields change, not on every edit of the JSON.
  const fields = useMemo(() => pdfFieldsOf(form), [form]);
  const matchingKey = JSON.stringify({ title: form?.title ?? "", fields });
  const matching = useMemo(() => JSON.parse(matchingKey), [matchingKey]);
  const matches = useMemo(
    () =>
      pdfIndex && matching.fields.length
        ? matchFields(pdfIndex, matching.fields, { title: matching.title })
        : NO_MATCHES,
    [pdfIndex, matching],
  );
  const titles = useMemo(() => new Map(matching.fields.map((field) => [field.id, field.title])), [matching]);

  return { doc: current.doc, error: current.error, pdfIndex, matches, titles };
}
