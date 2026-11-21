import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles/tailwind.css'
import ImportForm from './pages/ImportForm.jsx'
import Header from './components/header.jsx'
import Footer from './components/footer.jsx'
import EnsureAI from './components/EnsureAI'
import NotFound from './pages/NotFound.jsx'
import InspectForm from './pages/InspectForm.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Header/>
      {/* <EnsureAI/> */}
      <Routes>
        <Route path="/" element={<ImportForm />} />
        <Route path="/inspect-form" element={<InspectForm />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer/>
    </BrowserRouter>
  </StrictMode>,
)
