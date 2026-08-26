import { useCallback, useEffect, useState } from 'react'
import { getHuecosLibres, getListaEspera } from '../services/listaEspera'

/* La cola y los huecos libres van SIEMPRE juntos: por separado ninguno
   de los dos dice nada. Un hueco sin saber quién lo quiere no sirve, y
   saber quién espera sin ver si hay hueco tampoco. */
export function useListaEspera() {
  const [esperas, setEsperas] = useState([])
  const [huecos, setHuecos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    const [cola, libres] = await Promise.all([getListaEspera(), getHuecosLibres()])
    setError(cola.error ?? libres.error)
    if (cola.data) setEsperas(cola.data)
    if (libres.data) setHuecos(libres.data)
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  /** Mete o actualiza una espera en la cola sin volver a consultar */
  const aplicarCambio = useCallback((espera) => {
    setEsperas((lista) => {
      const existe = lista.some((e) => e.id === espera.id)
      const siguiente = existe
        ? lista.map((e) => (e.id === espera.id ? espera : e))
        : [...lista, espera]
      // El orden de la cola es el de llegada, siempre
      return siguiente.sort((a, b) => a.creadaEn.localeCompare(b.creadaEn))
    })
  }, [])

  /** Ya no está esperando: resuelta, cancelada o quitada */
  const quitar = useCallback((id) => {
    setEsperas((lista) => lista.filter((e) => e.id !== id))
  }, [])

  return { esperas, huecos, cargando, error, recargar, aplicarCambio, quitar }
}
