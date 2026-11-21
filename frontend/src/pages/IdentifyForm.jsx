import { ArrowLeft, FileText } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        <Button asChild variant="ghost" className="mb-6">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Wróć do przesyłania
          </Link>
        </Button>

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
                    <pre className="max-h-80 overflow-auto bg-background p-4 text-sm">
                      {JSON.stringify(item.convertedForm, null, 2)}
                    </pre>
                  </div>
                ))}
                <Button asChild className="mt-2 w-full">
                  <Link
                    to="/verify"
                    state={{ fileName, convertedForm, convertedForms }}
                  >
                    Sprawdź i zatwierdź
                  </Link>
                </Button>
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
