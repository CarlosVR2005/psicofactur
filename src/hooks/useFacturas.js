import { useCallback, useEffect, useState } from 'react'
import { getFacturas, getFacturasDePaciente } from '../services/facturas'

/**
 * @param {string|null} pacienteId  si viene, las facturas de ese paciente
 * @param {string|null} mes         'YYYY-MM' o 'todos'; sólo aplica sin
 *   `pacienteId`. Cambiar de mes vuelve a consultar.
 */
export function useFacturas(pacienteId = null, mes = null) {
  const [facturas, setFacturas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    const { data, error: fallo } = pacienteId
      ? await getFacturasDePaciente(pacienteId)
      : await getFacturas({ mes })
    setError(fallo)
    if (data) setFacturas(data)
    setCargando(false)
  }, [pacienteId, mes])

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
