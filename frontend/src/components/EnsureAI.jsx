import { Card } from "@/components/ui/card";

export default function EnsureAI() {
  return (
    <Card className="fixed left-1/2 top-1/2 z-[1000] w-[min(90vw,420px) ] -translate-x-1/2 -translate-y-1/2 box-border rounded-2xl p-6">
      <h1 className="text-[28px] font-bold">Sprawdzanie połączenia z lokalnym LLM</h1>
      
      <p className="m-0 text-sm text-[var(--muted-foreground)]">
        Sprawdzamy czy masz uruchomiony lokalny LLM. Jeśli nie, włącz go i poczekaj na nawiązanie połączenia.
      </p>
      <div className="loader mx-auto mt-4" role="status" aria-label="Sprawdzanie połączenia" />
    </Card>
  );
}
