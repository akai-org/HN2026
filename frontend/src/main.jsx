import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles/tailwind.css'
import ImportForm from './pages/ImportForm.jsx'
import AppLayout from './components/AppLayout.jsx'
import NotFound from './pages/NotFound.jsx'
import IdentifyForm from './pages/IdentifyForm.jsx'
import VerifyForm from './pages/VerifyForm.jsx'
import KonwerterLayout from './features/konwerter/KonwerterLayout.jsx'
import UploadPage from './features/konwerter/pages/UploadPage.jsx'
import ReviewRoute from './features/konwerter/ReviewRoute.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Konwerter formularzy: dodawanie plików → rozpoznawanie → sprawdzenie z podglądem na żywo. */}
        <Route path="/konwerter" element={<KonwerterLayout />}>
          <Route index element={<UploadPage />} />
          <Route path="sprawdz/:groupId?" element={<ReviewRoute />} />
        </Route>
        {/* Dawna makieta pierwszego ekranu przeszła do konwertera. */}
        <Route path="/makieta" element={<Navigate to="/konwerter" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<ImportForm />} />
          <Route path="/digitalize" element={<IdentifyForm />} />
          <Route path="/verify" element={<VerifyForm />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
