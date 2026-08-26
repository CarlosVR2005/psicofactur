import { CalendarHeart } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Boton from '../../components/ui/Boton'
import { FRANJAS, esperasDe } from '../../lib/espera'
import { etiquetaDia, haceRato, sumarMinutos } from '../../lib/fechas'

/* Un hueco libre —por una cancelación o simplemente porque nunca se
   ocupó, según el horario de trabajo— con la gente de la lista a la que
   le encaja.

   Es la pantalla que justifica toda la función: aquí es donde un rato
   libre deja de pasar desapercibido y se convierte en una cita para
   alguien que esperaba. Por eso las personas van con su botón al lado —
   de ver el hueco a dar la cita hay un toque. */
export default function HuecoLiberado({ hueco, esperas, alDarCita }) {
  const candidatos = esperasDe(hueco, esperas)

  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CalendarHeart className="size-5 shrink-0 text-verde" strokeWidth={1.9} />
        <p className="font-semibold text-tinta first-letter:uppercase">
          {etiquetaDia(hueco.fecha)}
        </p>
        <p className="font-medium tabular-nums text-tinta-suave">
          {hueco.hora} — {sumarMinutos(hueco.hora, hueco.duracion)}
        </p>
        <Badge tono="neutro" tamano="sm">
          {hueco.cancelPor ? `Canceló ${primerNombre(hueco.cancelPor)}` : 'Hueco libre'}
        </Badge>
      </div>

      {candidatos.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-suave">
          No hay nadie en la lista esperando para este día y esta franja.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {candidatos.map((espera) => (
            <li
              key={espera.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-crema/50 px-3 py-2.5"
            >
              <Avatar nombre={espera.pacienteNombre} tamano="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-tinta">
                  {espera.pacienteNombre}
                </p>
                <p className="truncate text-xs text-tinta-tenue">
                  {FRANJAS[espera.franja].corta} · esperando desde{' '}
                  {haceRato(espera.creadaEn)}
                </p>
              </div>
              <Boton tamano="sm" onClick={() => alDarCita(espera, hueco)}>
                Dar esta cita
              </Boton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function primerNombre(nombreCompleto = '') {
  return nombreCompleto.split(' ')[0]
}
