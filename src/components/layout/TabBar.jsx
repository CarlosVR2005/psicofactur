import { NavLink } from 'react-router-dom'
import { SECCIONES } from './navegacion'
import { useProximasCitas } from '../../hooks/useCitas'

/* Barra inferior del móvil: 4 destinos, siempre a un dedo de distancia. */
export default function TabBar() {
  const { citas } = useProximasCitas(7)
  const pendientes = citas.filter((c) => c.confirmacion === 'pendiente').length

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-white/95 pb-segura backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-lg">
        {SECCIONES.map(({ ruta, etiqueta, icono: Icono }) => (
          <NavLink
            key={ruta}
            to={ruta}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-1 px-1 pb-1.5 pt-2 text-[0.7rem] font-medium transition-colors ${
                isActive ? 'text-marca-600' : 'text-tinta-tenue'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icono
                    className="size-6"
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  {ruta === '/recordatorios' && pendientes > 0 && (
                    <span className="absolute -right-1.5 -top-0.5 min-w-4 rounded-full bg-ambar px-1 text-[0.6rem] font-bold leading-4 text-white">
                      {pendientes}
                    </span>
                  )}
                </span>
                {etiqueta}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
