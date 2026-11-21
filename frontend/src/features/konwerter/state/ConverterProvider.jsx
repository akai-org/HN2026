// Kontekst konwertera: stan plików i formularzy, kolejka rozpoznawania i komunikaty dla czytników ekranu.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { base64ToPdfBlob, checkHealth, convertFile, normalizeResult } from "../lib/api.js";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, fileTypeOf, partitionFiles } from "../lib/files.js";
import { MAX_FILES_PER_ADD } from "../lib/folders.js";
import { groupProblem, isEditable } from "../lib/grouping.js";
import { parseJson } from "../lib/jsonPositions.js";
import { mergeToPdf } from "../lib/pdfMerge.js";
import { FORMS, count, formatSize } from "../lib/text.js";
import { EXAMPLE } from "../lib/constants.js";
import { initialState, reducer } from "./reducer.js";

const ConverterContext = createContext(null);


const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function sourceForItem(item) {
  if (item.type?.kind === "image") return { kind: "image", url: item.previewUrl, owned: false, name: item.name };
  if (item.type?.kind === "pdf") return { kind: "pdf", url: URL.createObjectURL(item.file), owned: true, name: item.name };
  return { kind: "none", name: item.name, label: item.type?.label ?? "plik" };
}

export function ConverterProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const itemSeq = useRef(0);
  const doneSeq = useRef(0);
  const runRef = useRef({ active: false, queue: [], controller: null, currentId: null });
  const urlsRef = useRef(new Set());
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState("unknown");
  const [announcement, setAnnouncement] = useState({ text: "", id: 0 });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** Komunikat w regionie aria-live (ten sam tekst ogłaszamy ponownie dzięki id). */
  const announce = useCallback((text) => setAnnouncement((current) => ({ text, id: current.id + 1 })), []);

  // Zwalnianie adresów blob: URL, których nie używa już żaden plik ani podgląd.
  useEffect(() => {
    const live = new Set();
    Object.values(state.items).forEach((item) => item.previewUrl && live.add(item.previewUrl));
    state.groups.forEach((group) => group.source?.owned && group.source.url && live.add(group.source.url));
    for (const url of urlsRef.current) if (!live.has(url)) URL.revokeObjectURL(url);
    urlsRef.current = live;
  }, [state.items, state.groups]);

  useEffect(() => {
    const urls = urlsRef.current;
    const run = runRef.current;
    return () => {
      run.controller?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Czy backend i model językowy odpowiadają.
  useEffect(() => {
    const controller = new AbortController();
    checkHealth({ signal: controller.signal })
      .then(setHealth)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Ostrzeżenie przed zamknięciem karty w trakcie rozpoznawania.
  useEffect(() => {
    if (!running) return undefined;
    const onBeforeUnload = (event) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  const addFiles = useCallback(
    (entries, { truncated = false } = {}) => {
      if (!entries?.length) return;
      const known = Object.values(stateRef.current.items).map((item) => item.file);
      const { accepted, rejected } = partitionFiles(entries.slice(0, MAX_FILES_PER_ADD), known);
      if (truncated || entries.length > MAX_FILES_PER_ADD) {
        rejected.push({ name: "Pozostałe pliki", reason: `naraz można dodać do ${MAX_FILES_PER_ADD} plików` });
      }
      const items = accepted.map(({ file, folder }) => {
        const type = fileTypeOf(file.name);
        return {
          id: `p${++itemSeq.current}`,
          file,
          name: file.name,
          size: file.size,
          type,
          folder: folder ?? "",
          previewUrl: type?.kind === "image" ? URL.createObjectURL(file) : null,
        };
      });
      dispatch({ type: "ADD_ITEMS", items, rejected });
      const parts = [];
      if (items.length) parts.push(`Dodano ${count(items.length, FORMS.file)}.`);
      if (rejected.length) parts.push(`Nie dodano ${rejected.length === 1 ? "1 pliku" : `${rejected.length} plików`}.`);
      announce(parts.join(" "));
    },
    [announce],
  );

  const processGroup = useCallback(async (groupId) => {
    const group = stateRef.current.groups.find((candidate) => candidate.id === groupId);
    if (!group || group.status !== "queued") return null;
    const controller = new AbortController();
    runRef.current.controller = controller;
    runRef.current.currentId = groupId;
    dispatch({ type: "START", groupId, at: Date.now() });

    try {
      const items = group.itemIds.map((id) => stateRef.current.items[id]).filter(Boolean);
      const problem = groupProblem(group, stateRef.current.items);
      if (problem) throw new Error(problem.message);

      let file;
      let source;
      if (items.length === 1) {
        file = items[0].file;
        source = sourceForItem(items[0]);
      } else {
        file = await mergeToPdf(
          items.map((item) => item.file),
          { name: group.name, signal: controller.signal },
        );
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(
            `Połączone pliki mają ${formatSize(file.size)}, a limit to ${MAX_FILE_SIZE_MB} MB. Podziel formularz na mniejsze części.`,
          );
        }
        source = { kind: "pdf", url: URL.createObjectURL(file), owned: true, name: file.name, merged: items.length };
      }
      dispatch({ type: "SOURCE", groupId, source });

      const { form, warnings, sourcePdf } = await convertFile(file, { signal: controller.signal });
      let finalSource = source;
      if (sourcePdf?.base64) {
        finalSource = { kind: "pdf", url: URL.createObjectURL(base64ToPdfBlob(sourcePdf.base64)), owned: true, name: file.name, fromServer: true };
      } else if (sourcePdf?.url) {
        finalSource = { kind: "pdf", url: sourcePdf.url, owned: false, name: file.name, fromServer: true };
      }
      dispatch({ type: "SUCCESS", groupId, result: { form, warnings }, source: finalSource, at: Date.now() });
      return "done";
    } catch (error) {
      if (error?.name === "AbortError") {
        dispatch({ type: "CANCEL", groupIds: [groupId] });
        return "cancelled";
      }
      dispatch({ type: "FAIL", groupId, error: error?.message || "Nie udało się rozpoznać formularza.", at: Date.now() });
      return "error";
    } finally {
      runRef.current.controller = null;
      runRef.current.currentId = null;
    }
  }, []);

  const recognize = useCallback(
    async (groupIds) => {
      const groups = stateRef.current.groups;
      const eligible = groupIds.filter((id) => {
        const group = groups.find((candidate) => candidate.id === id);
        return group && isEditable(group) && !groupProblem(group, stateRef.current.items);
      });
      if (eligible.length === 0) return;
      dispatch({ type: "QUEUE", groupIds: eligible });
      const run = runRef.current;
      run.queue.push(...eligible.filter((id) => !run.queue.includes(id)));
      if (run.active) return;

      run.active = true;
      setRunning(true);
      announce(`Rozpoczęto rozpoznawanie: ${count(eligible.length, FORMS.form)}.`);
      const tally = { done: 0, error: 0, cancelled: 0 };
      try {
        while (run.queue.length > 0) {
          await nextTick();
          const id = run.queue.shift();
          const outcome = await processGroup(id);
          if (outcome) tally[outcome] += 1;
        }
      } finally {
        run.active = false;
        setRunning(false);
        const parts = [`Rozpoznawanie zakończone. Gotowe: ${tally.done}.`];
        if (tally.error) parts.push(`Z błędem: ${tally.error}.`);
        if (tally.cancelled) parts.push(`Anulowane: ${tally.cancelled}.`);
        announce(parts.join(" "));
      }
    },
    [announce, processGroup],
  );

  const cancel = useCallback((groupId) => {
    const run = runRef.current;
    run.queue = run.queue.filter((id) => id !== groupId);
    if (run.currentId === groupId) run.controller?.abort();
    else dispatch({ type: "CANCEL", groupIds: [groupId] });
  }, []);

  const cancelAll = useCallback(() => {
    const run = runRef.current;
    const ids = [...run.queue];
    run.queue = [];
    run.controller?.abort();
    dispatch({ type: "CANCEL", groupIds: ids });
    announce("Anulowano rozpoznawanie.");
  }, [announce]);

  const removeGroup = useCallback(
    (groupId) => {
      cancel(groupId);
      const group = stateRef.current.groups.find((candidate) => candidate.id === groupId);
      dispatch({ type: "REMOVE_GROUP", groupId });
      if (group) announce(`Usunięto formularz „${group.name}”.`);
    },
    [announce, cancel],
  );

  const clearAll = useCallback(() => {
    const run = runRef.current;
    run.queue = [];
    run.controller?.abort();
    dispatch({ type: "CLEAR" });
    announce("Wyczyszczono listę formularzy.");
  }, [announce]);

  /** Gotowy formularz bez rozpoznawania: przykład COI albo wczytany plik JSON. */
  const addDoneGroup = useCallback(({ name, origin, result, source }) => {
    const id = `x${++doneSeq.current}`;
    dispatch({ type: "ADD_DONE_GROUP", id, name, origin, result, source, at: Date.now() });
    return id;
  }, []);

  const loadExample = useCallback(
    async () => {
      const example = EXAMPLE;
      const base = `${import.meta.env.BASE_URL ?? "/"}przyklady/${example.file}`;
      const [jsonResponse, pdfResponse] = await Promise.all([fetch(`${base}.json`), fetch(`${base}.pdf`)]);
      if (!jsonResponse.ok) throw new Error("Nie udało się wczytać przykładowego formularza.");
      const result = normalizeResult(await jsonResponse.json());
      let source = null;
      if (pdfResponse.ok) {
        const blob = await pdfResponse.blob();
        source = { kind: "pdf", url: URL.createObjectURL(blob), owned: true, name: `${example.label}.pdf` };
      }
      const id = addDoneGroup({ name: result.form.title || example.label, origin: "example", result, source });
      announce(`Wczytano przykład: ${example.label}.`);
      return id;
    },
    [addDoneGroup, announce],
  );

  /** Wczytuje plik JSON (i opcjonalnie PDF albo zdjęcie oryginału) z dysku. */
  const importFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList ?? []);
      const jsonFile = files.find((file) => file.name.toLowerCase().endsWith(".json"));
      if (!jsonFile) throw new Error("Wybierz plik .json z definicją formularza (opcjonalnie razem z PDF-em oryginału).");
      const parsed = parseJson(await jsonFile.text());
      if (parsed.error) throw new Error(`Plik „${jsonFile.name}” nie jest poprawnym JSON-em: ${parsed.error.message} (linia ${parsed.error.line}).`);
      const result = normalizeResult(parsed.value);
      const original = files.find((file) => ["pdf", "image"].includes(fileTypeOf(file.name)?.kind));
      let source = null;
      if (original) {
        source = { kind: fileTypeOf(original.name).kind, url: URL.createObjectURL(original), owned: true, name: original.name };
      }
      const id = addDoneGroup({ name: result.form.title || jsonFile.name, origin: "import", result, source });
      announce(`Wczytano plik ${jsonFile.name}.`);
      return id;
    },
    [addDoneGroup, announce],
  );

  /** Dołącza oryginał (PDF albo zdjęcie) do formularza wczytanego bez niego. */
  const attachSource = useCallback(
    (groupId, file) => {
      const type = fileTypeOf(file.name);
      if (!type || !["pdf", "image"].includes(type.kind)) {
        announce("Oryginał musi być plikiem PDF albo zdjęciem JPG lub PNG.");
        return false;
      }
      dispatch({ type: "SOURCE", groupId, source: { kind: type.kind, url: URL.createObjectURL(file), owned: true, name: file.name } });
      announce(`Dołączono oryginał ${file.name}.`);
      return true;
    },
    [announce],
  );

  const actions = useMemo(
    () => ({
      addFiles,
      recognize,
      cancel,
      cancelAll,
      removeGroup,
      clearAll,
      loadExample,
      importFiles,
      attachSource,
      announce,
      removeItem: (itemId) => dispatch({ type: "REMOVE_ITEM", itemId }),
      dismissRejected: () => dispatch({ type: "DISMISS_REJECTED" }),
      split: (groupId, itemId) => dispatch({ type: "SPLIT", groupId, itemId }),
      mergeWithPrevious: (groupId) => dispatch({ type: "MERGE_PREV", groupId }),
      moveItem: (itemId, delta) => dispatch({ type: "MOVE_ITEM", itemId, delta }),
      mergeAll: () => dispatch({ type: "MERGE_ALL" }),
      splitAll: () => dispatch({ type: "SPLIT_ALL" }),
      rename: (groupId, name) => dispatch({ type: "RENAME", groupId, name }),
      setDocText: (groupId, text) => dispatch({ type: "DOC_TEXT", groupId, text, at: Date.now() }),
      setDocForm: (groupId, form) => dispatch({ type: "DOC_FORM", groupId, form, at: Date.now() }),
      undo: (groupId) => dispatch({ type: "DOC_UNDO", groupId }),
      redo: (groupId) => dispatch({ type: "DOC_REDO", groupId }),
      approve: (groupId, approved = true) => dispatch({ type: "APPROVE", groupId, approved }),
    }),
    [addFiles, recognize, cancel, cancelAll, removeGroup, clearAll, loadExample, importFiles, attachSource, announce],
  );

  const value = useMemo(
    () => ({ state, actions, running, health, announcement }),
    [state, actions, running, health, announcement],
  );

  return <ConverterContext.Provider value={value}>{children}</ConverterContext.Provider>;
}

// eslint-disable-next-line react/only-export-components
export function useConverter() {
  const context = useContext(ConverterContext);
  if (!context) throw new Error("useConverter musi być użyty wewnątrz <ConverterProvider>");
  return context;
}
