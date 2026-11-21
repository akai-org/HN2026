import { ArrowLeft, FileText } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function IdentifyForm() {
  const location = useLocation();
  const fileName = location.state?.fileName;
  const convertedForm = location.state?.convertedForm;

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
                <CardTitle className="text-xl">Przegląd formularza</CardTitle>
                {fileName && (
                  <p className="mt-1 text-sm text-muted-foreground">{fileName}</p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {convertedForm ? (
              <>
                <pre className="max-h-[65vh] overflow-auto rounded-lg border border-border bg-background p-4 text-sm">
                  {JSON.stringify(convertedForm, null, 2)}
                </pre>
                <Button asChild className="mt-4 w-full">
                  <Link
                    to="/verify"
                    state={{ fileName, convertedForm }}
                  >
                    Sprawdź i zatwierdź
                  </Link>
                </Button>
              </>
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
