import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import Marca from '../components/layout/Marca'
import Boton from '../components/ui/Boton'
import { Campo, Entrada } from '../components/ui/Campo'
import AvisoError from '../components/ui/AvisoError'
import Cargando from '../components/ui/Cargando'
import { useAuth } from '../store/AuthContext'

export default function LoginPage() {
  const { sesion, cargando, iniciarSesion } = useAuth()
  const ubicacion = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [entrando, setEntrando] = useState(false)

  if (cargando) return <Cargando texto="Comprobando la sesión…" className="min-h-dvh" />

  // Ya había sesión: volver a donde se quería ir
  if (sesion) {
    const destino = ubicacion.state?.desde ?? '/calendario'
    return <Navigate to={destino} replace />
  }

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)
    setEntrando(true)
    const { error: fallo } = await iniciarSesion(email, password)
    setEntrando(false)
    if (fallo) setError(fallo)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-crema px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Marca className="size-14" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-tinta">
            Psicofactur
          </h1>
          <p className="mt-1 text-tinta-suave">Entra para ver tu consulta</p>
        </div>

        <form
          onSubmit={enviar}
          className="space-y-4 rounded-3xl border border-borde bg-white p-6 shadow-suave"
        >
          <Campo etiqueta="Correo electrónico">
            <Entrada
              type="email"
              required
              autoFocus
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@correo.com"
            />
          </Campo>

          <Campo etiqueta="Contraseña">
            <Entrada
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Campo>

          <AvisoError error={error} />

          <Boton
            type="submit"
            icono={LogIn}
            tamano="lg"
            className="w-full"
            disabled={entrando}
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </Boton>
        </form>

        <p className="mt-6 text-center text-sm text-tinta-tenue">
          Si no recuerdas la contraseña, avisa a Carlos y te la restablece.
        </p>
      </div>
    </div>
  )
}
