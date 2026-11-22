import { Route, Routes } from "react-router-dom";
import AccessibilityMenu from "@/components/AccessibilityMenu";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import DigitalizeForm from "@/pages/DigitalizeForm";
import ImportForm from "@/pages/ImportForm";
import NotFound from "@/pages/NotFound";
import VerifyForm from "@/pages/VerifyForm";

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only fixed top-4 left-4 z-100 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:ring-3 focus:ring-ring focus:outline-none"
      >
        Przejdź do treści
      </a>
      <Header />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col bg-muted/30">
        <Routes>
          <Route path="/" element={<ImportForm />} />
          <Route path="/digitalize" element={<DigitalizeForm />} />
          <Route path="/verify" element={<VerifyForm />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <AccessibilityMenu />
    </div>
  );
}
