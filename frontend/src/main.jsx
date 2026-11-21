import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tailwind.css'
import App from './App.jsx'
import Header from './components/header.jsx'
import Footer from './components/footer.jsx'
import EnsureAI from './components/EnsureAI'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Header/> 
    {/* <EnsureAI/> */}
    <App />
    <Footer/>
  </StrictMode>,
)
