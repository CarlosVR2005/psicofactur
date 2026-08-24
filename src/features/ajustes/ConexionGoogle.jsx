import { useEffect, useState } from 'react'
import {
  CalendarCheck2,
  CalendarSync,
  DownloadCloud,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import Card from '../../components/ui/Card'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import {
  getConfigGoogle,
  guardarPreferenciasGoogle,
  olvidarConfigGoogle,
} from '../../services/ajustes'
import { conectar, desconectar, traerCambiosDeGoogle } from '../../services/googleCalendar'

/* Conectar o desconectar Google Calendar, y decidir si el nombre del
   paciente viaja al evento.

   El permiso es aparte del login: aquí no se pide contraseña ninguna,
   se manda a la pantalla de Google y se vuelve. */
export default function ConexionGoogle({ alAvisar }) {
  const [config, setConfig] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)

  const cargar = () =>
    getConfigGoogle({ refrescar: true }).then(({ data, error: fallo }) => {
      if (data) setConfig(data)
      if (fallo) setError(fallo)
    })

  useEffect(() => {
    cargar()
  }, [])

  if (!config) return null

  const activar = async () => {
    setError(null)
    setTrabajando(true)
    // Si sale bien, la página se va a Google y no vuelve por aquí
    const { error: fallo } = await conectar()
    if (fallo) {
      setTrabajando(false)
      setError(fallo)
    }
  }

  const apagar = async () => {
    setError(null)
    setTrabajando(true)
    const { error: fallo } = await desconectar()
    olvidarConfigGoogle()
    await cargar()
    setTrabajando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    alAvisar?.({ tipo: 'ok', titulo: 'Google Calendar desconectado' })
  }

  /* El sondeo automático va cada 10 minutos; esto es para no esperar.
     Con `completa` repasa la agenda entera en vez de sólo lo que ha
     cambiado: es lo que hace falta la primera vez, para traerse lo que
     ya existía en el calendario antes de conectar la app. */
  const traerAhora = async (completa = false) => {
    setError(null)
    setTrabajando(true)
    const { data, error: fallo } = await traerCambiosDeGoogle({ completa })
    setTrabajando(false)

    if (fallo) {
      await cargar() // por si el permiso ha caducado y hay que reconectar
      setError(fallo)
      return
    }

    const nuevas = data.creadas
    const cambios = data.actualizados + data.cancelados

    if (!nuevas && !cambios && !data.pendientes) {
      alAvisar?.({ tipo: 'ok', titulo: 'La agenda ya estaba al día' })
      return
    }

    const partes = []
    if (nuevas) partes.push(`${nuevas} ${nuevas === 1 ? 'cita nueva' : 'citas nuevas'}`)
    if (cambios) partes.push(`${cambios} actualizada${cambios === 1 ? '' : 's'}`)
    if (data.pendientes) partes.push(`${data.pendientes} por revisar`)

    alAvisar?.({
      tipo: 'ok',
      titulo: partes.join(' · '),
      detalle: data.parcial
        ? 'Quedan más eventos: vuelve a pulsar Importar para seguir.'
        : 'Traído de Google Calendar.',
    })
  }

  const cambiarNombre = async (mostrarNombre) => {
    setConfig({ ...config, mostrarNombre }) // respuesta inmediata al clic
    const { data, error: fallo } = await guardarPreferenciasGoogle({ mostrarNombre })
    if (data) setConfig(data)
    if (fallo) setError(fallo)
  }

  return (
    <Card className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-3">
        {config.conectado ? (
          <CalendarCheck2 className="mt-0.5 size-5 shrink-0 text-verde" strokeWidth={1.9} />
        ) : (
          <CalendarSync className="mt-0.5 size-5 shrink-0 text-tinta-tenue" strokeWidth={1.9} />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-medium text-tinta">Google Calendar</p>

          {config.conectado ? (
            <p className="mt-0.5 text-sm text-tinta-suave">
              Conectado
              {config.email ? (
                <>
                  {' como '}
                  <span className="font-medium text-tinta">{config.email}</span>
                </>
              ) : null}
              . Las citas que crees aquí aparecerán también en tu calendario.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-tinta-suave">
              Conéctalo y tus citas aparecerán también en el calendario del móvil. Es un
              permiso aparte: no cambia cómo entras en Psicofactur.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {trabajando && (
            <Loader2 className="size-4 animate-spin text-tinta-tenue" strokeWidth={2.2} />
          )}
          {config.conectado ? (
            <Boton variante="secundario" tamano="sm" onClick={apagar} disabled={trabajando}>
              Desconectar
            </Boton>
          ) : (
            <Boton variante="suave" tamano="sm" onClick={activar} disabled={trabajando}>
              {config.necesitaReconectar ? 'Volver a conectar' : 'Conectar'}
            </Boton>
          )}
        </div>
      </div>

      {/* Nada de fallos silenciosos: si Google retiró el permiso, se dice */}
      {config.necesitaReconectar && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-3 rounded-xl border border-ambar/30 bg-ambar-suave px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-ambar" strokeWidth={2} />
          <p className="text-sm text-tinta">
            Google ha retirado el permiso y las citas han dejado de sincronizarse. Pulsa
            «Volver a conectar» para arreglarlo.
          </p>
        </div>
      )}

      {config.conectado && (
        <div className="mt-4 space-y-3.5 border-t border-borde pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-sm text-tinta-suave">
              Lo que hagas en Google Calendar llega aquí solo cada 10 minutos. La primera
              vez, pulsa <strong>Importar agenda</strong> para traerte también las citas
              que ya tenías antes de conectar.
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Boton
                variante="fantasma"
                tamano="sm"
                icono={RefreshCw}
                onClick={() => traerAhora(false)}
                disabled={trabajando}
              >
                Traer ahora
              </Boton>
              <Boton
                variante="suave"
                tamano="sm"
                icono={DownloadCloud}
                onClick={() => traerAhora(true)}
                disabled={trabajando}
              >
                Importar agenda
              </Boton>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 border-t border-borde pt-3.5">
            <input
              type="checkbox"
              checked={config.mostrarNombre !== false}
              onChange={(e) => cambiarNombre(e.target.checked)}
              className="mt-0.5 size-4 accent-marca-500"
            />
            <span className="text-sm">
              <span className="font-medium text-tinta">
                Incluir el nombre del paciente en el evento
              </span>
              <span className="mt-0.5 block text-tinta-suave">
                {config.mostrarNombre !== false
                  ? 'Ejemplo: «Sesión · Marta García».'
                  : 'Los eventos se crean como «Sesión», sin el nombre.'}
              </span>
            </span>
          </label>
        </div>
      )}

      <AvisoError error={error} className="mt-3" />
    </Card>
  )
}
