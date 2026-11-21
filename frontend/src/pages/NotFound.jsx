import { ArrowLeft, FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-9rem)] items-center bg-muted/30 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileQuestion aria-hidden="true" size={32} />
        </span>
        <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-primary">
          Błąd 404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Nie znaleziono strony
        </h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          Strona, której szukasz, mogła zostać przeniesiona lub nie istnieje.
        </p>
        <Button asChild className="mt-8">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Wróć na stronę główną
          </Link>
        </Button>
      </div>
    </main>
  );
}
