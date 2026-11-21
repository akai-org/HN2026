import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles/tailwind.css'
import ImportForm from './pages/ImportForm.jsx'
import Header from './components/header.jsx'
import Footer from './components/footer.jsx'
import EnsureAI from './components/EnsureAI'
import NotFound from './pages/NotFound.jsx'
import IdentifyForm from './pages/IdentifyForm.jsx'
import VerifyForm from './pages/VerifyForm.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:outline-none focus:ring-3 focus:ring-ring"
      >
        Przejdź do treści
      </a>
      <Header/>
      {/* <EnsureAI/> */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<ImportForm />} />
          <Route path="/digitalize" element={<IdentifyForm />} />
          <Route path="/verify" element={<VerifyForm />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer/>
    </BrowserRouter>
  </StrictMode>,
)
