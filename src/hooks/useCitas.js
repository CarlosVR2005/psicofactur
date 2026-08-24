import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCitas, getCitasDePaciente, suscribirCitas } from '../services/citas'
import { aClave, hoy, sumarDias } from '../lib/fechas'

/**
 * Citas de un rango de fechas, con recarga automática en vivo.
 * @param {string} desde 'YYYY-MM-DD'
 * @param {string} hasta 'YYYY-MM-DD'
 */
export function useCitas(desde, hasta) {
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Para que la suscripción en vivo recargue siempre el rango actual
  const rango = useRef({ desde, hasta })
  rango.current = { desde, hasta }

  const recargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true)
    const { data, error: fallo } = await getCitas(
      rango.current.desde,
      rango.current.hasta,
    )
    setError(fallo)
    if (data) setCitas(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar, desde, hasta])

  // Realtime: si la agenda cambia (otro dispositivo, o mañana el webhook
  // de WhatsApp), se refresca sola sin recargar la página.
  useEffect(() => {
    const desuscribir = suscribirCitas(() => recargar({ silencioso: true }))
    return desuscribir
  }, [recargar])

  /** Agrupadas por día: el calendario pinta a partir de aquí */
  const citasPorDia = useMemo(() => {
    const mapa = new Map()
    citas.forEach((c) => {
      if (!mapa.has(c.fecha)) mapa.set(c.fecha, [])
      mapa.get(c.fecha).push(c)
    })
    mapa.forEach((lista) => lista.sort((a, b) => a.hora.localeCompare(b.hora)))
    return mapa
  }, [citas])

  return { citas, citasPorDia, cargando, error, recargar }
}

/** Próximas citas (para el aviso de confirmaciones pendientes) */
export function useProximasCitas(dias = 7) {
  const desde = aClave(hoy())
  const hasta = aClave(sumarDias(hoy(), dias))
  const { citas, cargando, error, recargar } = useCitas(desde, hasta)
  return { citas, cargando, error, recargar }
}

/** Todas las citas de un paciente (incluidas en las que va de acompañante) */
export function useCitasDePaciente(pacienteId) {
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    if (!pacienteId) return
    setCargando(true)
    const { data, error: fallo } = await getCitasDePaciente(pacienteId)
    setError(fallo)
    if (data) setCitas(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { citas, cargando, error, recargar }
}
