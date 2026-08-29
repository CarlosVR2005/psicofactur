import { useCallback, useEffect, useState } from 'react'
import { getFacturas, getFacturasDePaciente } from '../services/facturas'

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
