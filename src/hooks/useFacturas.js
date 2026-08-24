import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getFacturas,
  getFacturasDePaciente,
  getSesionesSinFacturar,
} from '../services/facturas'

export function useFacturas(pacienteId = null) {
  const [facturas, setFacturas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    const { data, error: fallo } = pacienteId
      ? await getFacturasDePaciente(pacienteId)
      : await getFacturas()
    setError(fallo)
    if (data) setFacturas(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    recargar()
  }, [recargar])

  /** Mete o actualiza una factura en la lista sin volver a consultar */
  const aplicarCambio = useCallback((factura) => {
    setFacturas((lista) => {
      const existe = lista.some((f) => f.id === factura.id)
      const siguiente = existe
        ? lista.map((f) => (f.id === factura.id ? factura : f))
        : [factura, ...lista]
      return siguiente.sort((a, b) =>
        `${b.fechaEmision}${b.numero}`.localeCompare(`${a.fechaEmision}${a.numero}`),
      )
    })
  }, [])

  return { facturas, cargando, error, recargar, aplicarCambio }
}

/** Sesiones ya dadas que aún no tienen factura, agrupadas por paciente */
export function useSesionesSinFacturar() {
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    const { data, error: fallo } = await getSesionesSinFacturar()
    setError(fallo)
    if (data) setSesiones(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  /** Al facturar una sesión, desaparece de la lista de pendientes */
  const quitar = useCallback((citaId) => {
    setSesiones((lista) => lista.filter((s) => s.citaId !== citaId))
  }, [])

  const porPaciente = useMemo(() => {
    const mapa = new Map()
    sesiones.forEach((s) => {
      if (!mapa.has(s.pacienteId)) mapa.set(s.pacienteId, [])
      mapa.get(s.pacienteId).push(s)
    })
    // De la más antigua a la más reciente: se factura por orden
    mapa.forEach((lista) => lista.sort((a, b) => a.fecha.localeCompare(b.fecha)))
    return mapa
  }, [sesiones])

  return { sesiones, porPaciente, cargando, error, recargar, quitar }
}
