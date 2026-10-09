import { useCallback, useEffect, useState } from 'react'
import { getPaciente, getPacientes } from '../services/pacientes'
import { useRefrescoAutomatico } from './useRefrescoAutomatico'

/* Puente entre la capa de servicios y los componentes: carga, error y
   recarga en un único sitio, para no repetirlo en cada pantalla. */

export function usePacientes({ incluirArchivados = false } = {}) {
  const [pacientes, setPacientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setCargando(true)
      const { data, error: fallo } = await getPacientes({ incluirArchivados })
      setError(fallo)
      // En una recarga silenciosa un fallo no vacía la lista que ya se ve
      if (data || !silencioso) setPacientes(data ?? [])
      setCargando(false)
    },
    [incluirArchivados],
  )

  useEffect(() => {
    recargar()
  }, [recargar])

  useRefrescoAutomatico(() => recargar({ silencioso: true }))

  /** Refleja en la lista un paciente recién creado o editado, sin ir al servidor */
  const aplicarCambio = useCallback(
    (paciente) => {
      setPacientes((lista) => {
        const existe = lista.some((p) => p.id === paciente.id)
        let siguiente = existe
          ? lista.map((p) => (p.id === paciente.id ? paciente : p))
          : [...lista, paciente]
        if (!incluirArchivados) siguiente = siguiente.filter((p) => p.activo)
        return siguiente.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      })
    },
    [incluirArchivados],
  )

  return { pacientes, cargando, error, recargar, aplicarCambio }
}

export function usePaciente(id) {
  const [paciente, setPaciente] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!id) return
      if (!silencioso) setCargando(true)
      const { data, error: fallo } = await getPaciente(id)
      setError(fallo)
      if (data || !silencioso) setPaciente(data)
      setCargando(false)
    },
    [id],
  )

  useEffect(() => {
    recargar()
  }, [recargar])

  useRefrescoAutomatico(() => recargar({ silencioso: true }))

  return { paciente, cargando, error, recargar, setPaciente }
}
