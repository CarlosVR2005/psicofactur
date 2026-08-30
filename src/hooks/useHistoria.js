import { useCallback, useEffect, useState } from 'react'
import { getEntradas } from '../services/historia'

/* Puente entre `services/historia` y la pestaña de historia clínica:
   carga, error y recarga en un sitio, más un `aplicarCambio` optimista
   para no recargar la lista entera después de guardar una entrada. */

/** Orden de la línea de tiempo: por fecha del hecho, y a igualdad, por
    orden de creación. Siempre de lo más reciente a lo más antiguo. */
function ordenar(a, b) {
  if (a.fecha !== b.fecha) return String(b.fecha).localeCompare(String(a.fecha))
  return String(b.creadoEn).localeCompare(String(a.creadoEn))
}

export function useHistoria(pacienteId) {
  const [entradas, setEntradas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    if (!pacienteId) return
    setCargando(true)
    const { data, error: fallo } = await getEntradas(pacienteId)
    setError(fallo)
    setEntradas(data ?? [])
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    recargar()
  }, [recargar])

  /** Refleja una entrada recién creada o editada sin ir al servidor. */
  const aplicarCambio = useCallback((entrada) => {
    setEntradas((lista) => {
      const existe = lista.some((e) => e.id === entrada.id)
      const siguiente = existe
        ? lista.map((e) => (e.id === entrada.id ? entrada : e))
        : [...lista, entrada]
      return siguiente.sort(ordenar)
    })
  }, [])

  /** Quita una entrada ya borrada de la lista. */
  const quitar = useCallback((id) => {
    setEntradas((lista) => lista.filter((e) => e.id !== id))
  }, [])

  return { entradas, cargando, error, recargar, aplicarCambio, quitar }
}
