import { CalendarCheck2, Video } from 'lucide-react'
import { TIPOS_CITA } from '../../lib/tipos'
import { sumarMinutos } from '../../lib/fechas'

/* Una cita dentro del calendario. Barra de color a la izquierda = tipo.
   Pensado para pulsarse con el dedo: toda la tarjeta es el botón. */
export default function CitaChip({ cita, alPulsar, compacto = false }) {
  const tipo = TIPOS_CITA[cita.tipo]
  const cancelada = cita.confirmacion === 'cancelada'

  // En las sesiones de pareja se ven los dos nombres
  const nombre = cita.acompananteNombre
    ? `${primerNombre(cita.pacienteNombre)} y ${primerNombre(cita.acompananteNombre)}`
    : cita.pacienteNombre

  return (
    <button
      onClick={() => alPulsar?.(cita)}
      className={`group flex w-full items-stretch gap-2.5 overflow-hidden rounded-xl border border-borde bg-white text-left shadow-suave transition-colors hover:border-marca-200 hover:bg-marca-50/40 ${
        cancelada ? 'opacity-55' : ''
      }`}
    >
      <span className={`w-1.5 shrink-0 ${tipo.barra}`} aria-hidden="true" />
      <span className={`min-w-0 flex-1 py-2 pr-2.5 ${compacto ? '' : 'sm:py-2.5'}`}>
        <span className="flex items-baseline gap-2">
          <span className="font-semibold tabular-nums text-tinta">{cita.hora}</span>
          {!compacto && (
            <span className="text-xs text-tinta-tenue">
              — {sumarMinutos(cita.hora, cita.duracion)}
            </span>
          )}
          {cita.tipo === 'online' && (
            <Video className="size-3.5 text-azul" strokeWidth={2.2} />
          )}
          {/* Está también en su Google Calendar */}
          {cita.googleEventId && (
            <CalendarCheck2
              className="size-3.5 text-verde"
              strokeWidth={2.2}
              aria-label="Sincronizada con Google Calendar"
            />
          )}
        </span>
        <span
          className={`mt-0.5 block truncate text-sm ${
            cancelada ? 'text-tinta-tenue line-through' : 'text-tinta-suave'
          }`}
        >
          {nombre}
        </span>
      </span>
    </button>
  )
}

function primerNombre(nombreCompleto = '') {
  return nombreCompleto.split(' ')[0]
}
