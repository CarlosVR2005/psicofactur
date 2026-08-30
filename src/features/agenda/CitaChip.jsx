import { CalendarCheck2, Check, Video } from 'lucide-react'
import { TIPOS_CITA } from '../../lib/tipos'
import { sumarMinutos } from '../../lib/fechas'

/* Una cita dentro del calendario. Barra de color a la izquierda = tipo
   de sesión. La confirmación del paciente se marca sólo cuando pide
   algo: ámbar en las que faltan por confirmar, apagada y tachada en las
   canceladas. Las confirmadas van en blanco, con un check discreto: son
   las que no hay que mirar. Toda la tarjeta es el botón. */
export default function CitaChip({ cita, alPulsar, compacto = false }) {
  const tipo = TIPOS_CITA[cita.tipo]
  const cancelada = cita.confirmacion === 'cancelada'
  const confirmada = cita.confirmacion === 'confirmada'
  const pendiente = cita.confirmacion === 'pendiente'

  // En las sesiones de pareja se ven los dos nombres
  const nombre = cita.acompananteNombre
    ? `${primerNombre(cita.pacienteNombre)} y ${primerNombre(cita.acompananteNombre)}`
    : cita.pacienteNombre

  const fondo = cancelada
    ? 'border-borde bg-white opacity-60'
    : pendiente
      ? 'border-ambar/30 bg-ambar-suave/40'
      : 'border-borde bg-white'

  return (
    <button
      onClick={() => alPulsar?.(cita)}
      className={`group flex w-full items-stretch gap-2.5 overflow-hidden rounded-xl border text-left transition-colors hover:border-marca-200 hover:bg-marca-50/40 ${fondo}`}
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

        <span className="mt-0.5 flex items-center gap-1.5">
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              cancelada ? 'text-tinta-tenue line-through' : 'text-tinta-suave'
            }`}
          >
            {nombre}
          </span>

          {confirmada && (
            <Check
              className="size-3.5 shrink-0 text-verde"
              strokeWidth={2.8}
              aria-label="El paciente ha confirmado"
            />
          )}
          {pendiente && (
            <span
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-ambar"
              title="Pendiente de que el paciente confirme"
            >
              <span className="size-1.5 rounded-full bg-ambar" aria-hidden="true" />
              {!compacto && 'Sin confirmar'}
            </span>
          )}
          {cancelada && (
            <span className="shrink-0 text-xs font-medium text-rojo">Cancelada</span>
          )}
        </span>
      </span>
    </button>
  )
}

function primerNombre(nombreCompleto = '') {
  return nombreCompleto.split(' ')[0]
}
