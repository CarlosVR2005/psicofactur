import { useEffect, useState } from 'react'
import { MessageCircleHeart, MessageCircleOff, TriangleAlert } from 'lucide-react'
import Card from '../../components/ui/Card'
import AvisoError from '../../components/ui/AvisoError'
import { getConfigWhatsApp, guardarPreferenciasWhatsApp } from '../../services/ajustes'
import { comprobarWhatsApp } from '../../services/recordatorios'

/* Envío automático de recordatorios por WhatsApp Business.

   Aquí no se pega ningún token: el de Meta vive como secreto de las
   Edge Functions. Esta tarjeta sólo dice si el servidor está listo y
   deja encender o apagar el envío por la API. */
export default function ConexionWhatsApp({ alAvisar }) {
  const [config, setConfig] = useState(null)
  const [servidor, setServidor] = useState(null) // { configurado, falta }
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    getConfigWhatsApp({ refrescar: true }).then(({ data, error: fallo }) => {
      if (!vivo) return
      if (data) setConfig(data)
      if (fallo) setError(fallo)
    })
    comprobarWhatsApp().then(({ data }) => {
      if (vivo && data) setServidor(data)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (!config) return null

  const listo = servidor?.configurado === true
  const comprobando = servidor === null

  /* Guarda un cambio suelto (el interruptor, la antelación, el acuse).
     Se pinta antes de guardar para que el clic responda al momento, y
     se deshace si el guardado falla. */
  const guardar = async (cambios, aviso) => {
    const antes = config
    setError(null)
    setGuardando(true)
    setConfig({ ...config, ...cambios })
    const { data, error: fallo } = await guardarPreferenciasWhatsApp(cambios)
    setGuardando(false)
    if (fallo) {
      setConfig(antes)
      setError(fallo)
      return
    }
    setConfig(data)
    if (aviso) alAvisar?.({ tipo: 'ok', titulo: aviso })
  }

  const cambiarActivo = (activo) =>
    guardar(
      { activo },
      activo
        ? `Los recordatorios saldrán solos ${config.horasAntes} h antes de cada cita`
        : 'Los recordatorios vuelven a mandarse a mano',
    )

  return (
    <Card className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-3">
        {config.activo && listo ? (
          <MessageCircleHeart className="mt-0.5 size-5 shrink-0 text-verde" strokeWidth={1.9} />
        ) : (
          <MessageCircleOff className="mt-0.5 size-5 shrink-0 text-tinta-tenue" strokeWidth={1.9} />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-medium text-tinta">Recordatorios por WhatsApp</p>
          <p className="mt-0.5 text-sm text-tinta-suave">
            {config.activo && listo
              ? `El recordatorio sale solo ${config.horasAntes} h antes de cada cita, y la respuesta del paciente entra sola en la app.`
              : 'Ahora mismo, al pulsar Enviar se abre WhatsApp con el mensaje escrito para mandarlo a mano.'}
          </p>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(config.activo)}
            onChange={(e) => cambiarActivo(e.target.checked)}
            disabled={!listo || guardando}
            className="size-4 accent-marca-500 disabled:opacity-40"
          />
          <span className={listo ? 'text-tinta' : 'text-tinta-tenue'}>Enviar solo</span>
        </label>
      </div>

      {/* Qué le falta al servidor para poder mandar */}
      {!comprobando && !listo && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-3 rounded-xl border border-ambar/30 bg-ambar-suave px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-ambar" strokeWidth={2} />
          <div className="min-w-0 text-sm text-tinta">
            <p>Falta configurar WhatsApp Business en el servidor.</p>
            {servidor?.falta?.length > 0 && (
              <p className="mt-1 break-words font-mono text-xs text-tinta-suave">
                {servidor.falta.join(' · ')}
              </p>
            )}
            <p className="mt-1 text-tinta-suave">
              Se ponen en Supabase → Edge Functions → Secrets. Ver el README.
            </p>
          </div>
        </div>
      )}

      {/* Cómo de automático: sólo tiene sentido con el envío encendido */}
      {listo && config.activo && (
        <div className="mt-3 space-y-3 border-t border-borde pt-3">
          <label className="flex flex-wrap items-center gap-2 text-sm text-tinta">
            <span>Avisar</span>
            <select
              value={config.horasAntes}
              onChange={(e) => guardar({ horasAntes: Number(e.target.value) })}
              disabled={guardando}
              className="rounded-lg border border-borde bg-white px-2 py-1.5 text-sm text-tinta disabled:opacity-40"
            >
              <option value={12}>12 horas</option>
              <option value={24}>24 horas</option>
              <option value={48}>48 horas</option>
            </select>
            <span>antes de la cita</span>
          </label>
          <p className="text-xs text-tinta-tenue">
            Cada paciente lo recibe a la hora de su cita, con esa antelación: no salen todos
            de madrugada. A las citas ya confirmadas o canceladas no se les manda nada.
          </p>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-tinta">
            <input
              type="checkbox"
              checked={config.acuse !== false}
              onChange={(e) => guardar({ acuse: e.target.checked })}
              disabled={guardando}
              className="mt-0.5 size-4 accent-marca-500 disabled:opacity-40"
            />
            <span>
              Contestar al paciente cuando pulse un botón
              <span className="block text-xs text-tinta-tenue">
                «✅ Tu cita ha quedado confirmada. ¡Gracias y hasta pronto!»
              </span>
            </span>
          </label>
        </div>
      )}

      {listo && (
        <p className="mt-3 border-t border-borde pt-3 text-xs text-tinta-tenue">
          Plantilla aprobada en Meta: <span className="font-mono">{config.plantilla}</span> (
          {config.idioma}). En el mensaje sólo van el nombre de pila, la fecha y la hora —
          nada del tipo de sesión ni de las notas.
        </p>
      )}

      <AvisoError error={error} className="mt-3" />
    </Card>
  )
}
