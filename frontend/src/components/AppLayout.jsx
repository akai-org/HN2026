import { Outlet } from 'react-router-dom'
import Header from './header.jsx'
import Footer from './footer.jsx'
import EnsureAI from './EnsureAI'

export default function AppLayout() {
  return (
    <>
      <Header/>
      {/* <EnsureAI/> */}
      <main className="flex-1">
        <Outlet/>
      </main>
      <Footer/>
    </>
  )
}
