// Pasek formularza: powrót do listy, przełączanie formularzy, cofnij/ponów, pobranie i zatwierdzenie.
import { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Download, Redo2, Undo2 } from "lucide-react";
import { Badge, Button, IconButton } from "../components/primitives.jsx";

export default function FormBar({ group, groups, onSwitch, onUndo, onRedo, onDownload, onApprove }) {
  const selectId = useId();
  const doc = group.doc;
  const title = doc.form?.title || group.name;
  const position = groups.findIndex((candidate) => candidate.id === group.id);

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link to="/konwerter" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-(--blue) hover:bg-(--blue-soft)">
          <ArrowLeft aria-hidden="true" size={17} /> Wszystkie formularze
        </Link>
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="flex min-w-0 items-center gap-2 text-xl font-bold text-slate-900">
            <span className="truncate" title={title}>
              {title}
            </span>
            {group.approved && <Badge tone="green" icon={BadgeCheck}>Zatwierdzony</Badge>}
          </h1>
        </div>

        {groups.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="text-sm font-semibold text-slate-800">
              {position + 1} z {groups.length}
              <span className="sr-only"> formularzy, przełącz formularz</span>
            </label>
            <select
              id={selectId}
              value={group.id}
              onChange={(event) => onSwitch(event.target.value)}
              className="h-10 max-w-64 rounded-xl border-2 border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-(--blue)"
            >
              {groups.map((candidate, index) => (
                <option key={candidate.id} value={candidate.id}>
                  {index + 1}. {candidate.doc?.form?.title || candidate.name}
                  {candidate.approved ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <IconButton label="Cofnij zmianę" icon={Undo2} onClick={onUndo} disabled={doc.past.length === 0} />
          <IconButton label="Ponów zmianę" icon={Redo2} onClick={onRedo} disabled={doc.future.length === 0} />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onDownload} size="md">
            <Download aria-hidden="true" size={17} /> <span className="hidden sm:inline">Pobierz</span> JSON
          </Button>
          <Button variant="primary" onClick={onApprove}>
            <BadgeCheck aria-hidden="true" size={18} /> {group.approved ? "Zatwierdzony" : "Zatwierdź formularz"}
          </Button>
        </div>
      </div>
    </div>
  );
}
