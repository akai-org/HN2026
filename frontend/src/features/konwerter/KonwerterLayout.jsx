// Wspólna rama konwertera: link „Przejdź do treści”, nagłówek z etapami, pomoc,
// ustawienia dostępności, region komunikatów dla czytników ekranu i stopka.
import { useState } from "react";
import { Outlet, useMatch } from "react-router-dom";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "./konwerter.css";
import AppHeader from "./components/AppHeader.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import HelpDialog from "./components/HelpDialog.jsx";
import { useAccessibilitySettings } from "./components/useAccessibilitySettings.js";
import { ConverterProvider, useConverter } from "./state/ConverterProvider.jsx";

function Shell() {
  const { announcement } = useConverter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [a11y, setA11y] = useAccessibilitySettings();
  const isReview = Boolean(useMatch("/konwerter/sprawdz/*"));

  return (
    <div className="kv-app relative isolate flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <a href="#tresc" className="kv-skip">
        Przejdź do treści głównej
      </a>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-120 bg-[radial-gradient(70%_100%_at_50%_0%,#dce8f8_0%,rgba(248,250,252,0)_100%)]"
      />
      <AppHeader
        onHelp={() => setHelpOpen(true)}
        a11ySettings={a11y}
        onA11yChange={setA11y}
        wide={isReview}
      />

      <main id="tresc" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <ErrorBoundary title="Coś poszło nie tak na tej stronie." hint="Odśwież stronę albo wróć do listy formularzy.">
          <Outlet context={{ openHelp: () => setHelpOpen(true) }} />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className={`mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-slate-600 sm:px-6 ${isReview ? "max-w-[1800px]" : "max-w-6xl"}`}>
          <p>Konwerter formularzy · papierowy wniosek → eUsługa</p>
          <button type="button" onClick={() => setHelpOpen(true)} className="font-semibold text-(--blue) underline-offset-2 hover:underline">
            Pomoc i deklaracja dostępności
          </button>
        </div>
      </footer>

      {/* Jeden region aria-live na całą aplikację: postęp, dodane pliki, zapisane zmiany. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={announcement.id}>{announcement.text}</span>
      </p>

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default function KonwerterLayout() {
  return (
    <ConverterProvider>
      <Shell />
    </ConverterProvider>
  );
}
