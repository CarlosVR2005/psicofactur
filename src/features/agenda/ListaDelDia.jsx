import { Plus } from 'lucide-react'
import CitaChip from './CitaChip'
import {
  duracionLegible,
  horasEnPuntoEntre,
  minutosEntre,
  sumarMinutos,
} from '../../lib/fechas'

/* ================================================================
   Las citas de un día, con los ratos libres a la vista.

   Antes se pintaban una detrás de otra con la misma separación, así
   que una agenda de 9:00, 10:00 y 17:00 se leía igual que tres
   sesiones seguidas. Ahora sólo van pegadas las que de verdad van
   pegadas, y entre las demás aparecen los huecos: uno por cada hora
   libre («10h», «11h»...), en vez de un único «2 h libres» que hay
   que traducir mentalmente a qué horas concretas corresponde.

   Cada hueco es pulsable y abre una cita nueva a esa hora, que es lo
   que se quiere hacer el 90 % de las veces que uno mira un rato libre.

   Un hueco muy corto no es un hueco: los cinco o diez minutos entre
   sesiones son el respiro de siempre, no un rato para meter a nadie.
   Por eso hay un mínimo.
   ================================================================ */

const MINIMO_HUECO = 15 // minutos

export default function ListaDelDia({ citas, alPulsarCita, alAnadirAlHueco, compacto = false }) {
  return (
    <div className="space-y-2">
      {citas.map((cita, i) => {
        const anterior = citas[i - 1]
        const huecos = anterior ? huecosEntre(anterior, cita) : []

        return (
          <div key={cita.id} className={huecos.length ? 'space-y-2' : ''}>
            {huecos.map((hueco) => (
              <HuecoLibre
                key={hueco.desde}
                {...hueco}
                compacto={compacto}
                alAnadir={alAnadirAlHueco ? () => alAnadirAlHueco(hueco.desde) : undefined}
              />
            ))}
            <CitaChip cita={cita} alPulsar={alPulsarCita} compacto={compacto} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Los ratos libres entre el final de una cita y el principio de la
 * siguiente, partidos en huecos de una hora en punto («10h», «11h»...).
 * Si el rato libre no llega a cubrir ninguna hora en punto (por ser
 * corto o por caer entre horas), se enseña como un único hueco con su
 * duración, igual que antes.
 */
function huecosEntre(anterior, siguiente) {
  const finAnterior = sumarMinutos(anterior.hora, anterior.duracion)
  const minutos = minutosEntre(finAnterior, siguiente.hora)

  // Solapadas o pegadas: no hay hueco que enseñar
  if (minutos < MINIMO_HUECO) return []

  const horas = horasEnPuntoEntre(finAnterior, siguiente.hora)
  if (horas.length > 0) {
    return horas.map((hora) => ({ desde: hora, hasta: sumarMinutos(hora, 60), enHora: true }))
  }

  return [{ desde: finAnterior, hasta: siguiente.hora, minutos }]
}

/** '10:00' -> '10h' */
function horaCorta(hora) {
  return `${Number(hora.split(':')[0])}h`
}

function HuecoLibre({ desde, hasta, minutos, enHora, alAnadir, compacto }) {
  const texto = enHora
    ? horaCorta(desde)
    : (() => {
        // «1 h libre», pero «2 h libres», «30 min libres», «1 h 30 min libres»
        const duracion = duracionLegible(minutos)
        return `${duracion} ${duracion === '1 h' ? 'libre' : 'libres'}`
      })()

  const contenido = (
    <>
      <span className="h-px flex-1 bg-borde" aria-hidden="true" />
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {alAnadir && (
          <Plus
            className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={2.5}
          />
        )}
        {texto}
        {!compacto && !enHora && (
          <span className="tabular-nums opacity-70">
            · {desde}–{hasta}
          </span>
        )}
      </span>
      <span className="h-px flex-1 bg-borde" aria-hidden="true" />
    </>
  )

  const clases = `flex items-center gap-2 px-1 text-tinta-tenue ${
    compacto ? 'py-0.5 text-[11px]' : 'py-1 text-xs'
  }`

  if (!alAnadir) {
    return <p className={clases}>{contenido}</p>
  }

  return (
    <button
      type="button"
      onClick={alAnadir}
      title={`Añadir una cita a las ${desde}`}
      className={`group w-full rounded-lg transition-colors hover:text-marca-600 ${clases}`}
    >
      {contenido}
    </button>
  )
}
