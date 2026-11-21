import { ArrowLeft, CircleCheck } from "@/components/icons";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyForm() {
  const location = useLocation();
  const fileName = location.state?.fileName;
  const convertedForms = location.state?.convertedForms || [];

  return (
    <main className="min-h-[calc(100vh-9rem)] bg-muted/30 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost" className="mb-6">
          <Link
            to="/digitalize"
            state={location.state}
          >
            <ArrowLeft aria-hidden="true" />
            Wróć do cyfryzowania
          </Link>
        </Button>

        <Card className="mx-auto max-w-2xl shadow-lg shadow-foreground/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CircleCheck aria-hidden="true" size={20} />
              </span>
              <div>
                <CardTitle className="text-xl">Sprawdź i zatwierdź</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {convertedForms.length
                    ? convertedForms.map((item) => item.fileName).join(", ")
                    : fileName || "Brak nazwy pliku"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Formularz został rozpoznany i można przejść do końcowej kontroli.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
