import { createContext, useContext } from "react";

/**
 * Wspólne dane podglądu formularza: odpowiedzi, stany pól (warunki), zaznaczenie i edycja.
 * Kontekst oszczędza przekazywania tych samych propsów przez każdy poziom sekcji.
 */
export const PreviewContext = createContext(null);

export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) throw new Error("usePreview musi być użyty wewnątrz PreviewContext");
  return context;
}
