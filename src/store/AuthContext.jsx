import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ================================================================
   SESIÓN

   Guarda la sesión de Supabase Auth y la fila de `psicologas`
   correspondiente (nombre, datos fiscales…), que crea sola el trigger
   `on_auth_user_created` al registrarse el usuario.
   ================================================================ */

const AuthContext = createContext(null)

/** Mensajes de Supabase Auth traducidos a algo que se entienda */
function traducirAuth(error) {
  const texto = String(error?.message ?? '')
  if (texto.includes('Invalid login credentials'))
    return 'El correo o la contraseña no son correctos.'
  if (texto.includes('Email not confirmed'))
    return 'Esta cuenta todavía no está confirmada. Revisa tu correo.'
  if (texto.includes('Failed to fetch'))
    return 'No hay conexión con el servidor. Comprueba internet e inténtalo otra vez.'
  if (texto.includes('rate limit') || texto.includes('Too many'))
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'
  return 'No se ha podido entrar. Inténtalo de nuevo en unos segundos.'
}

export function ProveedorAuth({ children }) {
  const [sesion, setSesion] = useState(null)
  const [psicologa, setPsicologa] = useState(null)
  const [cargando, setCargando] = useState(true)

  // Sesión inicial + escucha de cambios (login, logout, refresco de token)
  useEffect(() => {
    let vivo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSesion(data.session ?? null)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
      setCargando(false)
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Datos de la psicóloga que ha entrado
  useEffect(() => {
    if (!sesion?.user) {
      setPsicologa(null)
      return
    }
    let vivo = true
    supabase
      .from('psicologas')
      .select('id, nombre, email, telefono, numero_colegiado, nif, razon_social, direccion_fiscal')
      .eq('id', sesion.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) console.error('[Psicofactur] cargar psicóloga:', error)
        setPsicologa(data ?? null)
      })
    return () => {
      vivo = false
    }
  }, [sesion])

  const iniciarSesion = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return { data: null, error: { mensaje: traducirAuth(error), tecnico: error } }
    return { data, error: null }
  }, [])

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut()
    setPsicologa(null)
  }, [])

  const valor = useMemo(
    () => ({
      sesion,
      usuario: sesion?.user ?? null,
      psicologa,
      cargando,
      iniciarSesion,
      cerrarSesion,
    }),
    [sesion, psicologa, cargando, iniciarSesion, cerrarSesion],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <ProveedorAuth>')
  return ctx
}
