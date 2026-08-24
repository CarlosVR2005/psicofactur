import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProximasConRecordatorio } from '../services/recordatorios'
import { suscribirCitas } from '../services/citas'

/**
 * Próximas citas con su estado de confirmación, escuchando en vivo.
 *
 * Cuando el paciente responda al WhatsApp, el webhook escribirá en
 * `recordatorios_whatsapp.boton_pulsado`, el trigger actualizará
 * `citas.estado_confirmacion` y Realtime hará que este panel se
 * repinte solo, sin que nadie recargue nada.
 */
export function useRecordatorios(dias = 7) {
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(() => Date.now())

  const recargar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setCargando(true)
      const { data, error: fallo } = await getProximasConRecordatorio(dias)
      setError(fallo)
      if (data) {
        setCitas(data)
        setUltimaActualizacion(Date.now())
      }
      setCargando(false)
    },
    [dias],
  )

  useEffect(() => {
    recargar()
  }, [recargar])

  // Cualquier cambio en `citas` (incluido el que provocará el webhook)
  useEffect(() => suscribirCitas(() => recargar({ silencioso: true })), [recargar])

  const conteo = useMemo(
    () => ({
      todas: citas.length,
      pendiente: citas.filter((c) => c.confirmacion === 'pendiente').length,
      confirmada: citas.filter((c) => c.confirmacion === 'confirmada').length,
      cancelada: citas.filter((c) => c.confirmacion === 'cancelada').length,
      sinEnviar: citas.filter((c) => !c.enviado && c.confirmacion !== 'cancelada')
        .length,
    }),
    [citas],
  )

  /** Marca localmente una cita como "recordatorio enviado" */
  const marcarEnviada = useCallback((citaId, envio) => {
    setCitas((lista) =>
      lista.map((c) =>
        c.id === citaId
          ? {
              ...c,
              enviado: true,
              envios: c.envios + 1,
              enviadoAt: envio?.enviado_at ?? new Date().toISOString(),
              estadoEnvio: envio?.estado_envio ?? 'enviado',
            }
          : c,
      ),
    )
  }, [])

  /** Refleja al momento la respuesta anotada a mano (el trigger ya la aplicó) */
  const marcarRespondida = useCallback((citaId, resultado) => {
    setCitas((lista) =>
      lista.map((c) =>
        c.id === citaId
          ? {
              ...c,
              confirmacion: resultado.confirmacion,
              enviado: true,
              recordatorioId: resultado.id,
              enviadoAt: resultado.enviado_at ?? c.enviadoAt,
              estadoEnvio: resultado.estado_envio,
              respondidoAt: resultado.respondido_at,
              botonPulsado: resultado.boton_pulsado,
            }
          : c,
      ),
    )
  }, [])

  return {
    citas,
    conteo,
    cargando,
    error,
    recargar,
    marcarEnviada,
    marcarRespondida,
    ultimaActualizacion,
  }
}
