import { ArrowLeft, FileText } from "@/components/icons";
import { Link, useLocation } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function FormSummary({ result }) {
  const form = result?.form;
  const sections = form?.tabs?.flatMap((tab) =>
    (tab.questions || []).filter((question) => question.field)
  ) || [];
  const warnings = result?.warnings || [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Tytuł</p>
          <p className="mt-1 font-medium">{form?.title || "Nieznany formularz"}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Zakładki</p>
          <p className="mt-1 text-2xl font-semibold">{form?.tabs?.length || 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Pola</p>
          <p className="mt-1 text-2xl font-semibold">{sections.length}</p>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Ostrzeżenia</p>
          <ul className="mt-1 list-inside list-disc">
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function IdentifyForm() {
  const location = useLocation();
  const fileName = location.state?.fileName;
  const convertedForm = location.state?.convertedForm;
  const convertedForms = location.state?.convertedForms || (
    convertedForm ? [{ fileName, convertedForm }] : []
  );

  return (
    <main className="min-h-[calc(100vh-9rem)] bg-muted/30 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className={buttonVariants({ variant: "ghost", className: "mb-6" })}>
          <ArrowLeft aria-hidden="true" />
          Wróć do przesyłania
        </Link>

        <Card className="shadow-lg shadow-foreground/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText aria-hidden="true" size={20} />
              </span>
              <div>
                <CardTitle className="text-xl">Cyfryzacja formularza</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {convertedForms.length
                    ? `${convertedForms.length} ${convertedForms.length === 1 ? "formularz" : "formularze"}`
                    : "Brak plików"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {convertedForms.length ? (
              <div className="space-y-4">
                {convertedForms.map((item, index) => (
                  <div key={`${item.fileName}-${index}`} className="rounded-lg border border-border">
                    <div className="border-b border-border px-4 py-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                        Formularz {item.formNumber || 1}
                      </p>
                      <p className="truncate text-sm font-medium">{item.fileName}</p>
                    </div>
                    <div className="p-4">
                      <FormSummary result={item.convertedForm} />
                      <details className="mt-4 rounded-lg border border-border">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                          Pokaż pełny JSON
                        </summary>
                        <pre className="max-h-80 overflow-auto border-t border-border bg-background p-4 text-sm">
                          {JSON.stringify(item.convertedForm, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                ))}
                <Link
                  to="/verify"
                  state={{ fileName, convertedForm, convertedForms }}
                  className={buttonVariants({ size: "lg", className: "mt-2 w-full" })}
                >
                  Sprawdź i zatwierdź
                </Link>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Formularz nie został przekazany do przeglądu.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
