import { Link } from "react-router-dom";
import { ChevronLeft, FileQuestion } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <div className="max-w-xl text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileQuestion size={32} />
        </span>
        <p className="mt-6 text-sm font-medium tracking-[0.2em] text-primary uppercase">Błąd 404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Nie znaleziono strony</h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          Strona, której szukasz, mogła zostać przeniesiona lub nie istnieje.
        </p>
        <Link to="/" className={buttonVariants({ className: "mt-8" })}>
          <ChevronLeft />
          Wróć na stronę główną
        </Link>
      </div>
    </div>
  );
}
