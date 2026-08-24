import { NavLink } from 'react-router-dom'
import { LogOut, Settings } from 'lucide-react'
import { SECCIONES } from './navegacion'
import Marca from './Marca'
import { useProximasCitas } from '../../hooks/useCitas'
import { useAuth } from '../../store/AuthContext'

export default function Sidebar() {
  const { citas } = useProximasCitas(7)
  const { psicologa, usuario, cerrarSesion } = useAuth()
  const pendientes = citas.filter((c) => c.confirmacion === 'pendiente').length

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-borde bg-white md:flex">
      <div className="flex items-center gap-3 px-5 py-6">
        <Marca />
        <div className="leading-tight">
          <p className="font-semibold text-tinta">Psicofactur</p>
          <p className="text-xs text-tinta-tenue">Consulta de psicología</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {SECCIONES.map(({ ruta, etiqueta, icono: Icono }) => (
          <NavLink
            key={ruta}
            to={ruta}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${
                isActive
                  ? 'bg-marca-50 text-marca-700'
                  : 'text-tinta-suave hover:bg-crema hover:text-tinta'
              }`
            }
          >
            <Icono className="size-5" strokeWidth={1.9} />
            <span className="flex-1">{etiqueta}</span>
            {ruta === '/recordatorios' && pendientes > 0 && (
              <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar">
                {pendientes}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-borde px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-tinta">
            {psicologa?.nombre ?? 'Mi consulta'}
          </p>
          <p className="truncate text-xs text-tinta-tenue">
            {psicologa?.numero_colegiado
              ? `Col. ${psicologa.numero_colegiado}`
              : (usuario?.email ?? '')}
          </p>
        </div>
        {/* Ajustes no es una sección más: se usa dos veces al año y no
            debe robarle sitio a las cuatro de trabajo diario. */}
        <NavLink
          to="/ajustes"
          title="Ajustes"
          aria-label="Ajustes"
          className={({ isActive }) =>
            `rounded-xl p-2 transition-colors hover:bg-crema hover:text-tinta ${
              isActive ? 'bg-marca-50 text-marca-700' : 'text-tinta-tenue'
            }`
          }
        >
          <Settings className="size-4.5" strokeWidth={1.9} />
        </NavLink>
        <button
          onClick={cerrarSesion}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="rounded-xl p-2 text-tinta-tenue transition-colors hover:bg-crema hover:text-tinta"
        >
          <LogOut className="size-4.5" strokeWidth={1.9} />
        </button>
      </div>
    </aside>
  )
}
