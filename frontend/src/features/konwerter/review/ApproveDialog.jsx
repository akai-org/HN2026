// Zatwierdzenie formularza: podsumowanie, ostatnie uwagi i pobranie pliku JSON do importu.
import { useRef } from "react";
import { BadgeCheck, CircleAlert, Download, TriangleAlert } from "lucide-react";
import { Button, Modal } from "../components/primitives.jsx";
import { FORMS, count } from "../lib/text.js";

export default function ApproveDialog({ open, onClose, group, stats, checks, onApprove, onDownload, nextGroup, onNext, onBackToList }) {
  const confirmRef = useRef(null);
  const errors = checks.issues.filter((issue) => issue.level === "error");
  const warnings = checks.issues.filter((issue) => issue.level === "warning");
  const approved = group.approved;
  const hasJsonError = Boolean(group.doc?.error);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      initialFocusRef={confirmRef}
      title={approved ? "Formularz zatwierdzony" : "Zatwierdzić formularz?"}
      description={group.doc?.form?.title}
      footer={
        approved ? (
          <>
            <Button variant="quiet" onClick={onBackToList}>
              Wróć do listy
            </Button>
            <Button onClick={onDownload}>
              <Download aria-hidden="true" size={17} /> Pobierz JSON jeszcze raz
            </Button>
            {nextGroup && (
              <Button ref={confirmRef} variant="primary" onClick={onNext}>
                Następny formularz
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="quiet" onClick={onClose}>
              Wróć do poprawek
            </Button>
            <Button ref={confirmRef} variant="primary" disabled={hasJsonError} onClick={onApprove}>
              <BadgeCheck aria-hidden="true" size={18} /> Zatwierdź i pobierz JSON
            </Button>
          </>
        )
      }
    >
      {approved ? (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          <BadgeCheck aria-hidden="true" size={22} className="mt-0.5 shrink-0" />
          <p>
            Plik JSON został pobrany. Zaimportuj go w systemie eUsług. Jeśli coś poprawisz, zatwierdź formularz ponownie,
            żeby pobrać nową wersję.
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-slate-800">
          <p>
            Formularz ma {count(stats.pages, FORMS.page)} i {count(stats.fields, FORMS.field)}, w tym {stats.autoFilled} uzupełnianych z rejestrów.
            Po zatwierdzeniu pobierzesz plik JSON gotowy do importu.
          </p>
          {hasJsonError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 font-semibold text-red-900">
              <CircleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
              JSON ma błąd w linii {group.doc.error.line}. Popraw go albo cofnij zmianę, zanim zatwierdzisz.
            </p>
          )}
          {errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="flex items-center gap-2 font-semibold text-red-900">
                <CircleAlert aria-hidden="true" size={17} /> {count(errors.length, ["błąd", "błędy", "błędów"])} do poprawy
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-red-900">
                {errors.slice(0, 5).map((issue) => (
                  <li key={issue.id}>{issue.title}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-900">
              <TriangleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
              {count(warnings.length, FORMS.issue)} do rozważenia. Możesz zatwierdzić mimo nich.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
