import { useEffect, useMemo, useState } from 'react'
import { MessageCircleHeart, Send } from 'lucide-react'
import Cabecera from '../components/layout/Cabecera'
import Card from '../components/ui/Card'
import Boton from '../components/ui/Boton'
import Badge from '../components/ui/Badge'
import EstadoVacio from '../components/ui/EstadoVacio'
import AvisoError from '../components/ui/AvisoError'
import Aviso from '../components/ui/Aviso'
import { EsqueletoLista } from '../components/ui/Cargando'
import RecordatorioCard from '../features/recordatorios/RecordatorioCard'
import { useRecordatorios } from '../hooks/useRecordatorios'
import { etiquetaDia, haceRato } from '../lib/fechas'
import { getConfigWhatsApp } from '../services/ajustes'

const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'pendiente', etiqueta: 'Pendientes' },
  { id: 'confirmada', etiqueta: 'Confirmadas' },
  { id: 'cancelada', etiqueta: 'Canceladas' },
]

export default function RecordatoriosPage() {
  const {
    citas,
    conteo,
    cargando,
    error,
    recargar,
    marcarEnviada,
    marcarRespondida,
    ultimaActualizacion,
  } = useRecordatorios(7)

  const [filtro, setFiltro] = useState('todas')
  const [aviso, setAviso] = useState(null)

  /* Se lee una vez al entrar: decide si el botón Enviar manda por la API
     o abre WhatsApp. Va aquí y no en cada tarjeta para no consultar los
     ajustes una vez por cita. */
  const [apiActiva, setApiActiva] = useState(false)
  useEffect(() => {
    let vivo = true
    getConfigWhatsApp().then(({ data }) => {
      if (vivo && data) setApiActiva(Boolean(data.activo))
    })
    return () => {
      vivo = false
    }
  }, [])

  // Refresca el "hace X minutos" aunque no llegue ningún cambio
  const [, setTic] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTic((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const visibles =
    filtro === 'todas' ? citas : citas.filter((c) => c.confirmacion === filtro)

  // Agrupadas por día: Hoy, Mañana, jueves…
  const porDia = useMemo(() => {
    const grupos = new Map()
    visibles.forEach((c) => {
      if (!grupos.has(c.fecha)) grupos.set(c.fecha, [])
      grupos.get(c.fecha).push(c)
    })
    return [...grupos.entries()]
  }, [visibles])

  return (
    <>
      <Cabecera
        titulo="Recordatorios"
        subtitulo="Confirmación de las citas de los próximos 7 días"
        accion={
          <Badge tono="verde" punto vivo>
            En vivo
          </Badge>
        }
      >
        {/* Qué hace esta pantalla hoy y qué hará cuando esté la API */}
        <Card className="flex flex-wrap items-center gap-3 border-marca-200 bg-marca-50/70 px-4 py-3">
          <MessageCircleHeart
            className="size-5 shrink-0 text-marca-600"
            strokeWidth={1.9}
          />
          <p className="min-w-0 flex-1 text-sm text-marca-800">
            {apiActiva ? (
              <>
                Al pulsar <strong>Enviar</strong> el recordatorio sale solo por
                WhatsApp. Cuando el paciente pulse un botón, el estado cambia aquí
                sin tocar nada. Los botones <strong>✓</strong> y <strong>✕</strong>{' '}
                siguen ahí por si te contesta por otro sitio.
              </>
            ) : (
              <>
                Al pulsar <strong>Enviar</strong> se abre WhatsApp con el recordatorio
                ya escrito y queda anotado el envío. Cuando el paciente te conteste,
                marca su respuesta con <strong>✓</strong> o <strong>✕</strong>. Puedes
                activar el envío automático en <strong>Ajustes</strong>.
              </>
            )}
          </p>
        </Card>

        {/* Contadores que además filtran */}
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const activo = filtro === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                aria-pressed={activo}
                className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                  activo
                    ? 'border-marca-300 bg-marca-50 text-marca-700'
                    : 'border-borde bg-white text-tinta-suave hover:bg-crema'
                }`}
              >
                {f.etiqueta}
                <span className="ml-1.5 tabular-nums text-tinta-tenue">
                  {conteo[f.id] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      </Cabecera>

      <AvisoError error={error} alReintentar={recargar} className="mb-4" />

      {cargando ? (
        <EsqueletoLista filas={4} />
      ) : porDia.length === 0 ? (
        <EstadoVacio
          icono={MessageCircleHeart}
          titulo={
            citas.length === 0 ? 'No hay citas esta semana' : 'Nada con ese estado'
          }
          texto={
            citas.length === 0
              ? 'Cuando haya citas en los próximos 7 días aparecerán aquí para poder recordárselas a los pacientes.'
              : 'Prueba a quitar el filtro para ver todas las citas.'
          }
          accion={
            citas.length > 0 && (
              <Boton variante="secundario" onClick={() => setFiltro('todas')}>
                Ver todas
              </Boton>
            )
          }
        />
      ) : (
        <div className="space-y-6">
          {porDia.map(([fecha, lista]) => (
            <section key={fecha}>
              <h2 className="mb-2 px-1 font-semibold text-tinta first-letter:uppercase">
                {etiquetaDia(fecha)}
                <span className="ml-2 text-sm font-normal text-tinta-suave">
                  {lista.length} {lista.length === 1 ? 'cita' : 'citas'}
                </span>
              </h2>
              <Card className="divide-y divide-borde overflow-hidden">
                {lista.map((cita) => (
                  <RecordatorioCard
                    key={cita.id}
                    cita={cita}
                    apiActiva={apiActiva}
                    alEnviar={(citaId, envio) => {
                      marcarEnviada(citaId, envio)
                      setAviso({
                        tipo: 'exito',
                        titulo: apiActiva
                          ? 'Recordatorio enviado'
                          : 'Recordatorio anotado',
                        detalle: apiActiva
                          ? `${cita.pacienteNombre} · te avisaremos cuando conteste`
                          : `${cita.pacienteNombre} · revisa WhatsApp para mandarlo`,
                      })
                    }}
                    alResponder={(citaId, resultado) => {
                      marcarRespondida(citaId, resultado)
                      setAviso({
                        tipo: 'exito',
                        titulo:
                          resultado.confirmacion === 'confirmada'
                            ? 'Cita confirmada'
                            : 'Cita cancelada',
                        detalle: cita.pacienteNombre,
                      })
                    }}
                    alFallar={setAviso}
                  />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      {conteo.sinEnviar > 0 && !cargando && (
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-tinta-tenue">
          <Send className="size-4 shrink-0" />
          {conteo.sinEnviar}{' '}
          {conteo.sinEnviar === 1
            ? 'cita sin recordatorio enviado'
            : 'citas sin recordatorio enviado'}
        </p>
      )}

      <p className="mt-2 text-center text-xs text-tinta-tenue">
        Actualizado {haceRato(ultimaActualizacion)} · se actualiza solo
      </p>

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}
