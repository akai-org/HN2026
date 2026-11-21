// Krok 3: sprawdzenie formularza. Trzy kolumny: oryginał, podgląd eUsługi i JSON.
// Podgląd i JSON są połączone na żywo: zmiana w jednym od razu widać w drugim,
// a zaznaczone pole jest podświetlone w obu miejscach.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookOpenCheck, FilePlus2, FileUp, RotateCcw } from "lucide-react";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import { Button, Modal, Switch } from "../components/primitives.jsx";
import { buttonClass } from "../components/buttonClass.js";
import { SourceViewer } from "../components/viewers.jsx";
import { runChecks } from "../lib/checks.js";
import { evaluateStates, techTitleMap } from "../lib/conditions.js";
import { downloadJson } from "../lib/download.js";
import {
  deleteField,
  dependentsOf,
  formStats,
  indexForm,
  initialAnswers,
  moveField,
  pathKey,
  questionPathFromJsonPath,
  renameField,
  setRequired,
  tabsInOrder,
} from "../lib/formModel.js";
import { buildTree, pathAtOffset, rangeForPath } from "../lib/jsonPositions.js";
import { resolveRegistryValue } from "../lib/registry.js";
import { scrollWithin } from "../lib/scroll.js";
import { FORMS, count } from "../lib/text.js";
import ApproveDialog from "../review/ApproveDialog.jsx";
import ChecksPanel from "../review/ChecksPanel.jsx";
import { Columns, ColumnsToolbar } from "../review/Columns.jsx";
import FormBar from "../review/FormBar.jsx";
import FormPreview from "../review/FormPreview.jsx";
import JsonPanel, { JsonActions } from "../review/JsonPanel.jsx";
import { useColumns, useMediaQuery } from "../review/useColumns.js";
import { useConverter } from "../state/ConverterProvider.jsx";

function EmptyReview({ actions, missing }) {
  const navigate = useNavigate();
  const importRef = useRef(null);
  const [error, setError] = useState("");
  const load = async (task) => {
    setError("");
    try {
      navigate(`/konwerter/sprawdz/${await task()}`, { replace: true });
    } catch (loadError) {
      setError(loadError?.message ?? "Nie udało się wczytać formularza.");
    }
  };
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6">
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-(--blue-soft) text-(--blue)">
        <BookOpenCheck aria-hidden="true" size={30} />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-slate-900 sm:text-3xl">{missing ? "Nie znaleźliśmy tego formularza" : "Nie ma jeszcze formularzy do sprawdzenia"}</h1>
      <p className="mt-3 text-slate-700">
        {missing
          ? "Wyniki rozpoznawania są przechowywane tylko w tej karcie i znikają po odświeżeniu strony."
          : "Dodaj pliki i rozpoznaj je albo otwórz przykład do testu."}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Link to="/konwerter" className={buttonClass({ variant: "primary" })}>
          <FilePlus2 aria-hidden="true" size={18} /> Dodaj pliki
        </Link>
        <Button onClick={() => load(() => actions.loadExample())}>
          <BookOpenCheck aria-hidden="true" size={17} /> Otwórz przykład
        </Button>
        <Button variant="quiet" onClick={() => importRef.current?.click()}>
          <FileUp aria-hidden="true" size={17} /> Wczytaj JSON
        </Button>
        <input
          ref={importRef}
          type="file"
          multiple
          accept=".json,.pdf,.jpg,.jpeg,.png,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = event.target.files;
            load(() => actions.importFiles(files));
            event.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}

function AttachOriginal({ onAttach }) {
  const ref = useRef(null);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-sm text-slate-700">
      <p className="max-w-xs font-semibold text-slate-900">Brak oryginału do porównania</p>
      <p className="max-w-xs">Dołącz PDF albo zdjęcie papierowego formularza, żeby widzieć je obok wyniku.</p>
      <Button onClick={() => ref.current?.click()}>
        <FileUp aria-hidden="true" size={17} /> Dołącz oryginał
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          if (file) onAttach(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function Workbench({ group, groups, actions }) {
  const navigate = useNavigate();
  const doc = group.doc;
  const form = doc.form;
  const index = useMemo(() => indexForm(form), [form]);
  const titles = useMemo(() => techTitleMap(form), [form]);
  const stats = useMemo(() => formStats(form), [form]);
  const tabs = useMemo(() => tabsInOrder(form), [form]);
  const tree = useMemo(() => buildTree(doc.text), [doc.text]);

  const [answers, setAnswers] = useState(() => initialAnswers(form, resolveRegistryValue));
  const [conditions, setConditions] = useState({ states: {}, errors: [] });
  const [selection, setSelection] = useState({ id: null, source: null, at: 0 });
  const [page, setPage] = useState(0);
  const [flashId, setFlashId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("form");
  const columns = useColumns();
  const isWide = useMediaQuery("(min-width: 1024px)");
  const previewScrollRef = useRef(null);

  // Warunki (JSONata) liczymy na nowo po każdej zmianie odpowiedzi albo JSON-a.
  useEffect(() => {
    let cancelled = false;
    evaluateStates(form, answers).then((result) => {
      if (!cancelled) setConditions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [form, answers]);

  const checks = useMemo(() => {
    const result = runChecks(form, { warnings: group.result?.warnings ?? [], conditionErrors: conditions.errors });
    if (doc.error) {
      result.issues.unshift({
        id: "json-error",
        level: "error",
        rule: "json",
        title: `JSON ma błąd w linii ${doc.error.line}: ${doc.error.message}.`,
        detail: "Podgląd pokazuje ostatnią poprawną wersję. Popraw błąd albo cofnij zmianę.",
      });
    }
    return result;
  }, [form, group.result, conditions.errors, doc.error]);

  const selectedEntry = selection.id ? index.byId.get(selection.id) ?? null : null;
  const selectedId = selectedEntry ? selection.id : null;

  const highlight = useMemo(() => {
    if (!selectedEntry || doc.error) return null;
    const range = rangeForPath(tree, selectedEntry.path);
    return range ? { ...range, scroll: selection.source !== "json", key: `${selection.id}:${selection.at}` } : null;
  }, [selectedEntry, doc.error, tree, selection]);

  const selectField = useCallback(
    (id, source) => {
      setSelection({ id, source, at: Date.now() });
      setRenamingId(null);
      if (source === "preview") return;
      const entry = index.byId.get(id);
      if (!entry) return;
      const position = tabs.findIndex((tab) => tab.index === entry.tabIndex);
      if (position >= 0) setPage(position);
      if (conditions.states[id] && !conditions.states[id].visible) {
        setShowHidden(true);
        actions.announce("Zaznaczone pole jest teraz ukryte warunkiem, więc włączyliśmy pokazywanie ukrytych pól.");
      }
      if (!isWide && source !== "json") setMobileTab("form");
    },
    [index, tabs, conditions.states, isWide, actions],
  );

  // Pole zaznaczone poza podglądem: przewiń do niego i mrugnij obwódką.
  useEffect(() => {
    if (!selection.id || selection.source === "preview") return undefined;
    const frame = requestAnimationFrame(() => {
      const element = previewScrollRef.current?.querySelector(`[data-field-id="${CSS.escape(selection.id)}"]`);
      scrollWithin(previewScrollRef.current, element, "center");
      setFlashId(selection.id);
    });
    const timer = setTimeout(() => setFlashId(null), 900);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [selection, page, showHidden]);

  const onCursor = useCallback(
    (offset) => {
      if (doc.error) return;
      const questionPath = questionPathFromJsonPath(pathAtOffset(tree, offset));
      const entry = questionPath ? index.byPath.get(pathKey(questionPath)) : null;
      if (entry?.field.id && entry.field.id !== selection.id) selectField(entry.field.id, "json");
    },
    [doc.error, tree, index, selection.id, selectField],
  );

  const commit = useCallback(
    (nextForm, message) => {
      if (nextForm === form) return;
      actions.setDocForm(group.id, nextForm);
      if (message) actions.announce(`${message} JSON został zaktualizowany.`);
    },
    [actions, form, group.id],
  );

  const showInJson = useCallback(
    (id) => {
      columns.show("json");
      if (!isWide) setMobileTab("json");
      setSelection({ id, source: "toolbar", at: Date.now() });
    },
    [columns, isWide],
  );

  // Ctrl+Z / Ctrl+Y poza edytorem i polami tekstowymi cofają zmiany formularza.
  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.target.closest?.(".cm-editor, input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        actions.undo(group.id);
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        actions.redo(group.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [actions, group.id]);

  const previewContext = useMemo(
    () => ({
      answers,
      setAnswer: (key, value) => setAnswers((current) => ({ ...current, [key]: value })),
      states: conditions.states,
      showHidden,
      showNotes,
      titles,
      selectedId,
      flashId,
      onSelect: (id) => selectField(id, "preview"),
      renamingId,
      setRenamingId,
      onRename: (id, title) => commit(renameField(form, id, title), `Zmieniono etykietę na „${title}”.`),
      onToggleRequired: (id, required) => commit(setRequired(form, id, required), required ? "Pole jest teraz obowiązkowe." : "Pole nie jest już obowiązkowe."),
      onMove: (id, delta) => {
        const next = moveField(form, id, delta);
        if (next === form) actions.announce(delta < 0 ? "To pole jest już pierwsze." : "To pole jest już ostatnie.");
        else commit(next, delta < 0 ? "Przesunięto pole wyżej." : "Przesunięto pole niżej.");
      },
      onDelete: (id) => setDeleteId(id),
      onShowInJson: showInJson,
    }),
    [answers, conditions.states, showHidden, showNotes, titles, selectedId, flashId, selectField, renamingId, commit, form, actions, showInJson],
  );

  const deleteEntry = deleteId ? index.byId.get(deleteId) : null;
  const deleteDependents = deleteEntry ? dependentsOf(form, deleteEntry.field.techName).filter((entry) => entry.field.id !== deleteId) : [];
  const nextGroup = groups.find((candidate) => candidate.id !== group.id && !candidate.approved);
  const download = () => downloadJson(doc.text, form.title || group.name);

  const panels = {
    original: {
      title: "Oryginał",
      subtitle: group.source?.merged ? `${group.source.merged} pliki połączone w PDF` : group.source?.name ?? "Papierowy formularz",
      body: group.source?.url ? <SourceViewer source={group.source} /> : group.source?.kind === "none" ? <SourceViewer source={group.source} /> : <AttachOriginal onAttach={(file) => actions.attachSource(group.id, file)} />,
    },
    form: {
      title: "Formularz",
      subtitle: "Podgląd na żywo, tak zobaczy go mieszkaniec",
      body: (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-white px-3 py-2">
            <Switch checked={showHidden} onChange={setShowHidden} label="Pokaż pola ukryte warunkami" />
            <Switch checked={showNotes} onChange={setShowNotes} label="Objaśnienia" />
            <Button
              variant="quiet"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setAnswers(initialAnswers(form, resolveRegistryValue));
                actions.announce("Wyczyszczono odpowiedzi w podglądzie.");
              }}
            >
              <RotateCcw aria-hidden="true" size={15} /> Wyczyść odpowiedzi
            </Button>
          </div>
          <div ref={previewScrollRef} className="kv-scroll min-h-0 flex-1 overflow-y-auto">
            <ErrorBoundary resetKey={doc.text} title="Nie udało się narysować podglądu formularza.">
              <FormPreview form={form} page={page} onPage={setPage} context={previewContext} />
            </ErrorBoundary>
          </div>
        </div>
      ),
    },
    json: {
      title: "JSON",
      subtitle: "Plik do importu w eUsługach",
      actions: <JsonActions doc={doc} title={form.title || group.name} onText={(text) => actions.setDocText(group.id, text)} announce={actions.announce} />,
      body: (
        <JsonPanel
          doc={doc}
          onText={(text) => actions.setDocText(group.id, text)}
          selectedEntry={selectedEntry}
          selectedState={selectedId ? conditions.states[selectedId] : null}
          highlight={highlight}
          onCursor={onCursor}
          onSelect={(id) => selectField(id, "tree")}
          titles={titles}
          states={conditions.states}
        />
      ),
    },
  };

  return (
    <>
      <FormBar
        group={group}
        groups={groups}
        onSwitch={(id) => navigate(`/konwerter/sprawdz/${id}`)}
        onUndo={() => actions.undo(group.id)}
        onRedo={() => actions.redo(group.id)}
        onDownload={download}
        onApprove={() => setApproveOpen(true)}
      />
      <div className="mx-auto w-full max-w-[1800px] space-y-4 px-4 py-4 sm:px-6">
        <ErrorBoundary resetKey={doc.text} title="Nie udało się sprawdzić formularza.">
          <ChecksPanel stats={stats} checks={checks} onShowField={(id) => selectField(id, "checks")} />
        </ErrorBoundary>
        {isWide && <ColumnsToolbar {...columns} isWide />}
        <Columns {...columns} panels={panels} isWide={isWide} mobileTab={mobileTab} onMobileTab={setMobileTab} />
      </div>

      <Modal
        open={Boolean(deleteEntry)}
        onClose={() => setDeleteId(null)}
        size="sm"
        title="Usunąć pole?"
        description={deleteEntry ? `„${deleteEntry.field.title || deleteEntry.field.techName}”` : undefined}
        footer={
          <>
            <Button variant="quiet" onClick={() => setDeleteId(null)}>
              Zostaw
            </Button>
            <button
              type="button"
              className={buttonClass({ variant: "primary", className: "bg-red-700 hover:bg-red-800" })}
              onClick={() => {
                const title = deleteEntry.field.title || deleteEntry.field.techName;
                commit(deleteField(form, deleteId), `Usunięto pole „${title}”.`);
                setDeleteId(null);
                setSelection({ id: null, source: null, at: Date.now() });
              }}
            >
              Usuń pole
            </button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-800">
          {deleteEntry?.field.type === "SECTION" && <p>Usuniesz też wszystkie pola w tej sekcji.</p>}
          {deleteDependents.length > 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
              Od odpowiedzi w tym polu zależy {count(deleteDependents.length, FORMS.field)}:{" "}
              {deleteDependents
                .slice(0, 4)
                .map((entry) => `„${entry.field.title || entry.field.techName}”`)
                .join(", ")}
              . Ich warunki przestaną działać.
            </p>
          ) : (
            <p>Zmianę możesz cofnąć przyciskiem „Cofnij zmianę”.</p>
          )}
        </div>
      </Modal>

      <ApproveDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        group={group}
        stats={stats}
        checks={checks}
        nextGroup={nextGroup}
        onDownload={download}
        onApprove={() => {
          download();
          actions.approve(group.id, true);
          actions.announce("Formularz zatwierdzony, plik JSON pobrany.");
        }}
        onNext={() => {
          setApproveOpen(false);
          if (nextGroup) navigate(`/konwerter/sprawdz/${nextGroup.id}`);
        }}
        onBackToList={() => navigate("/konwerter")}
      />
    </>
  );
}

export default function ReviewPage() {
  const { groupId } = useParams();
  const { state, actions } = useConverter();
  const groups = state.groups.filter((group) => group.status === "done" && group.doc);
  const group = groupId ? groups.find((candidate) => candidate.id === groupId) : groups[0];

  useEffect(() => {
    document.title = group ? `${group.doc.form?.title || group.name} · Sprawdzanie · Konwerter formularzy` : "Sprawdzanie · Konwerter formularzy";
  }, [group]);

  if (!group) return <EmptyReview actions={actions} missing={Boolean(groupId)} />;
  return <Workbench key={group.id} group={group} groups={groups} actions={actions} />;
}
