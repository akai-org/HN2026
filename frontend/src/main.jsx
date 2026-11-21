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
      <Header/>
      {/* <EnsureAI/> */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<ImportForm />} />
          <Route path="/identify" element={<IdentifyForm />} />
          <Route path="/verify" element={<VerifyForm />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer/>
    </BrowserRouter>
  </StrictMode>,
)
