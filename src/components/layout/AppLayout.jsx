import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { LogOut, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import Marca from './Marca'
import { useAuth } from '../../store/AuthContext'

export default function AppLayout() {
  const { pathname } = useLocation()
  const { psicologa, cerrarSesion } = useAuth()

  // Al cambiar de sección, empezar arriba (como una app nativa)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh bg-crema">
      <Sidebar />

      {/* Barra superior sólo en móvil: marca y salir. En escritorio esto
          vive en la barra lateral. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-borde bg-white/95 px-4 py-2.5 pt-segura backdrop-blur md:hidden">
        <Marca className="size-8" />
        <p className="min-w-0 flex-1 truncate font-medium text-tinta">
          {psicologa?.nombre ?? 'Psicofactur'}
        </p>
        <NavLink
          to="/ajustes"
          aria-label="Ajustes"
          className={({ isActive }) =>
            `rounded-xl p-2 transition-colors active:bg-crema ${
              isActive ? 'text-marca-600' : 'text-tinta-tenue'
            }`
          }
        >
          <Settings className="size-5" strokeWidth={1.9} />
        </NavLink>
        <button
          onClick={cerrarSesion}
          aria-label="Cerrar sesión"
          className="rounded-xl p-2 text-tinta-tenue transition-colors active:bg-crema"
        >
          <LogOut className="size-5" strokeWidth={1.9} />
        </button>
      </header>

      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10">
          <Outlet />
        </main>
      </div>
      <TabBar />
    </div>
  )
}
