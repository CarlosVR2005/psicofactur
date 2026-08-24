import { useCallback, useEffect, useState } from 'react'
import { CalendarSearch, CheckCheck } from 'lucide-react'
import Cabecera from '../components/layout/Cabecera'
import Card from '../components/ui/Card'
import Aviso from '../components/ui/Aviso'
import AvisoError from '../components/ui/AvisoError'
import EstadoVacio from '../components/ui/EstadoVacio'
import { EsqueletoLista } from '../components/ui/Cargando'
import EventoPendiente from '../features/agenda/EventoPendiente'
import { getEventosPendientes } from '../services/eventosPendientes'
import { usePacientes } from '../hooks/usePacientes'

/* Los eventos del calendario de Google que la importación no ha sabido
   de quién son.

   Es una tarea de una vez: al conectar Google entran de golpe los años
   de agenda que ya tenía. Después sólo aparecerá alguno suelto, cuando
   ella apunte una cita sin poner el teléfono. */
export default function RevisarEventosPage() {
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  // Para el buscador de cada evento
  const { pacientes } = usePacientes()

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: fallo } = await getEventosPendientes()
    setError(fallo)
    if (data) setEventos(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /* Se quita de la lista al momento, sin recargar: si ella resuelve
     cuarenta seguidos, esperar a la base entre uno y otro se hace
     eterno. */
  const resolver = (id, mensaje) => {
    setEventos((lista) => lista.filter((e) => e.id !== id))
    setAviso({ tipo: 'exito', ...mensaje })
  }

  return (
    <>
      <Cabecera
        titulo="Eventos por revisar"
        subtitulo="Citas de tu Google Calendar que no sabemos de quién son"
      >
        <Card className="flex flex-wrap items-center gap-3 border-marca-200 bg-marca-50/70 px-4 py-3">
          <CalendarSearch className="size-5 shrink-0 text-marca-600" strokeWidth={1.9} />
          <p className="min-w-0 flex-1 text-sm text-marca-800">
            Los eventos que llevan el teléfono en el título entran solos en la agenda.
            Estos no lo llevan, así que hay que decir de quién son.{' '}
            <strong>Lo que no sea una sesión, descártalo</strong> y no volverá a
            preguntarse.
          </p>
        </Card>
      </Cabecera>

      <AvisoError error={error} alReintentar={cargar} className="mb-4" />

      {cargando ? (
        <EsqueletoLista filas={5} />
      ) : eventos.length === 0 ? (
        <EstadoVacio
          icono={CheckCheck}
          titulo="No queda nada por revisar"
          texto="Todos los eventos de tu calendario están asignados o descartados. Si aparece alguno nuevo, te avisaremos desde el Calendario."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-tinta-suave">
            {eventos.length === 1
              ? 'Queda 1 evento por revisar.'
              : `Quedan ${eventos.length} eventos por revisar.`}
          </p>
          <Card className="divide-y divide-borde overflow-hidden">
            {eventos.map((evento) => (
              <EventoPendiente
                key={evento.id}
                evento={evento}
                pacientes={pacientes}
                alResolver={resolver}
                alFallar={(fallo) =>
                  setAviso({ tipo: 'error', titulo: fallo.mensaje })
                }
              />
            ))}
          </Card>
        </>
      )}

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}
