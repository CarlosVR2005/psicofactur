import { Navigate, useLocation } from 'react-router-dom'
import Cargando from '../ui/Cargando'
import { useAuth } from '../../store/AuthContext'

/* Envuelve las secciones privadas: sin sesión, a la pantalla de entrada.
   Guarda de dónde venía para volver ahí después de entrar. */
export default function RutaProtegida({ children }) {
  const { sesion, cargando } = useAuth()
  const ubicacion = useLocation()

  if (cargando) return <Cargando texto="Abriendo tu consulta…" className="min-h-dvh" />

  if (!sesion) {
    return (
      <Navigate to="/entrar" replace state={{ desde: ubicacion.pathname }} />
    )
  }

  return children
}
