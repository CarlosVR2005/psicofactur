import { useMemo, useState } from 'react'
import { CalendarPlus, Check, Loader2, UserPlus, X } from 'lucide-react'
import Boton from '../../components/ui/Boton'
import Buscador from '../../components/ui/Buscador'
import Avatar from '../../components/ui/Avatar'
import { convertirEnCita, ignorarEvento } from '../../services/eventosPendientes'
import { crearPaciente } from '../../services/pacientes'
import { etiquetaDia } from '../../lib/fechas'
import { normalizar } from '../../lib/formato'

/* Un evento del calendario de Google que la importación no ha sabido de
   quién es. Dos salidas: decir de quién es, o decir que no es una cita.

   El nombre que la importación leyó en el título viene ya escrito en el
   buscador: casi siempre basta con pulsar el paciente que sale. */
export default function EventoPendiente({ evento, pacientes, alResolver, alFallar }) {
  const [eligiendo, setEligiendo] = useState(false)
  const [busqueda, setBusqueda] = useState(evento.nombreDetectado || '')
  const [trabajando, setTrabajando] = useState(false)

  const candidatos = useMemo(() => {
    const texto = normalizar(busqueda.trim())
    if (!texto) return pacientes.slice(0, 6)
    return pacientes.filter((p) => normalizar(p.nombre).includes(texto)).slice(0, 6)
  }, [busqueda, pacientes])

  const nombreNuevo = busqueda.trim()
  // ¿La búsqueda coincide exactamente con alguien? Entonces no ofrecer crearlo
  const yaExiste = pacientes.some((p) => normalizar(p.nombre) === normalizar(nombreNuevo))

  const descartar = async () => {
    setTrabajando(true)
    const { error } = await ignorarEvento(evento)
    setTrabajando(false)
    if (error) return alFallar?.(error)
    alResolver?.(evento.id, { titulo: 'Descartado', detalle: evento.titulo })
  }

  const asignar = async (paciente) => {
    setTrabajando(true)
    const { error } = await convertirEnCita(evento, paciente.id)
    setTrabajando(false)
    if (error) return alFallar?.(error)
    alResolver?.(evento.id, {
      titulo: `Cita de ${paciente.nombre}`,
      detalle: `${etiquetaDia(evento.fecha)} a las ${evento.hora}`,
    })
  }

  /* Ficha nueva a partir del título. Va a medias a propósito: sin DNI ni
     precio. Lo importante ahora es que la cita exista y tenga dueño. */
  const crearYAsignar = async () => {
    setTrabajando(true)
    const { data: paciente, error } = await crearPaciente({
      nombre: nombreNuevo,
      telefono: evento.telefonoDetectado || '',
    })
    if (error) {
      setTrabajando(false)
      return alFallar?.(error)
    }
    const { error: fallo } = await convertirEnCita(evento, paciente.id)
    setTrabajando(false)
    if (fallo) return alFallar?.(fallo)
    alResolver?.(evento.id, {
      titulo: `Ficha creada: ${paciente.nombre}`,
      detalle: 'Recuerda completarla con el DNI y el precio.',
    })
  }

  return (
    <article className="px-4 py-4 transition-colors hover:bg-crema/40 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="w-24 shrink-0">
          <p className="text-sm font-medium capitalize text-tinta">
            {etiquetaDia(evento.fecha)}
          </p>
          <p className="text-sm tabular-nums text-tinta-suave">{evento.hora}</p>
        </div>

        <div className="min-w-0 flex-1">
          {/* El título tal cual está en Google, sin interpretar */}
          <p className="break-words font-medium text-tinta">{evento.titulo}</p>
          <p className="mt-0.5 text-sm text-tinta-tenue">
            {evento.duracion} min · de tu Google Calendar
          </p>
        </div>

        {!eligiendo && (
          <div className="flex shrink-0 items-center gap-2">
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={descartar}
              disabled={trabajando}
              icono={trabajando ? undefined : X}
            >
              {trabajando ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
              ) : null}
              No es una cita
            </Boton>
            <Boton
              variante="suave"
              tamano="sm"
              icono={CalendarPlus}
              onClick={() => setEligiendo(true)}
              disabled={trabajando}
            >
              Sí es una cita
            </Boton>
          </div>
        )}
      </div>

      {eligiendo && (
        <div className="mt-3 rounded-2xl border border-borde bg-crema/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-tinta">¿De quién es esta cita?</p>
            <button
              onClick={() => setEligiendo(false)}
              aria-label="Cancelar"
              className="rounded-lg p-1.5 text-tinta-tenue hover:bg-white hover:text-tinta"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-2.5">
            <Buscador
              valor={busqueda}
              alCambiar={setBusqueda}
              placeholder="Buscar en tus pacientes…"
            />
          </div>

          <div className="mt-2.5 space-y-1">
            {candidatos.map((p) => (
              <button
                key={p.id}
                onClick={() => asignar(p)}
                disabled={trabajando}
                className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left transition-colors hover:bg-marca-50 disabled:opacity-50"
              >
                <Avatar nombre={p.nombre} tamano="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-tinta">{p.nombre}</span>
                  {p.telefono && (
                    <span className="block truncate text-xs text-tinta-tenue">
                      {p.telefono}
                    </span>
                  )}
                </span>
                <Check className="size-4 shrink-0 text-tinta-tenue" strokeWidth={2.2} />
              </button>
            ))}

            {candidatos.length === 0 && !nombreNuevo && (
              <p className="px-1 py-2 text-sm text-tinta-tenue">
                Escribe un nombre para buscarlo entre tus pacientes.
              </p>
            )}

            {/* Paciente que todavía no tiene ficha */}
            {nombreNuevo && !yaExiste && (
              <button
                onClick={crearYAsignar}
                disabled={trabajando}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-marca-300 bg-white px-3 py-2.5 text-left transition-colors hover:bg-marca-50 disabled:opacity-50"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marca-50 text-marca-600">
                  {trabajando ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
                  ) : (
                    <UserPlus className="size-4" strokeWidth={2} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-marca-700">
                    Crear ficha de «{nombreNuevo}»
                  </span>
                  <span className="block text-xs text-tinta-tenue">
                    {evento.telefonoDetectado
                      ? `Con el teléfono ${evento.telefonoDetectado}`
                      : 'Sin teléfono; podrás completarla después'}
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
