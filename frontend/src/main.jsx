import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles/tailwind.css'
import ImportForm from './pages/ImportForm.jsx'
import AppLayout from './components/AppLayout.jsx'
import NotFound from './pages/NotFound.jsx'
import IdentifyForm from './pages/IdentifyForm.jsx'
import VerifyForm from './pages/VerifyForm.jsx'
import MockupUpload from './pages/MockupUpload.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Testowa makieta z Figmy: ma własny nagłówek, więc renderuje się bez wspólnego layoutu. */}
        <Route path="/makieta" element={<MockupUpload />} />
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
