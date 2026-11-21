// Ekran sprawdzania ładuje pdf.js i edytor JSON, więc pobiera się dopiero po wejściu na niego.
import { Suspense, lazy } from "react";

const ReviewPage = lazy(() => import("./pages/ReviewPage.jsx"));

export default function ReviewRoute() {
  return (
    <Suspense
      fallback={
        <p role="status" className="mx-auto my-16 text-center text-slate-600">
          Wczytywanie ekranu sprawdzania…
        </p>
      }
    >
      <ReviewPage />
    </Suspense>
  );
}
