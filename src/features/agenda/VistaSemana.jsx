import { CalendarOff } from 'lucide-react'
import ListaDelDia from './ListaDelDia'
import { aClave, DIAS_CORTOS, esHoy } from '../../lib/fechas'

/* Semana de un vistazo.
   Escritorio: una columna por día. Móvil: lista vertical por días,
   que es como se lee de verdad la agenda con el teléfono en la mano. */
export default function VistaSemana({ dias, citasPorDia, alPulsarCita, alAnadirEnDia }) {
  return (
    <div className="grid gap-3 md:grid-cols-7 md:gap-2.5">
      {dias.map((dia) => {
        const clave = aClave(dia)
        // Las canceladas se quedan a la vista, tachadas: así ella ve que
        // el paciente canceló y puede reprogramarlas. El hueco se libera
        // igual en la lista de espera.
        const citas = citasPorDia.get(clave) ?? []
        const hoyEs = esHoy(clave)
        const finde = dia.getDay() === 0 || dia.getDay() === 6

        if (finde && citas.length === 0) {
          // Los findes vacíos no ocupan sitio en el móvil
          return (
            <div key={clave} className="hidden md:block">
              <CabeceraDia dia={dia} hoyEs={hoyEs} atenuado />
              <div className="mt-2 rounded-xl border border-dashed border-borde py-6 text-center text-xs text-tinta-tenue">
                Libre
              </div>
            </div>
          )
        }

        return (
          <div
            key={clave}
            className={hoyEs ? 'rounded-2xl bg-marca-50/60 p-2 md:p-1.5' : ''}
          >
            <CabeceraDia dia={dia} hoyEs={hoyEs} />
            <div className="mt-2 space-y-2">
              <ListaDelDia
                citas={citas}
                alPulsarCita={alPulsarCita}
                alAnadirAlHueco={(hora) => alAnadirEnDia(clave, hora)}
                compacto
              />
              {citas.length === 0 && (
                <p className="flex items-center gap-1.5 rounded-xl border border-dashed border-borde px-3 py-4 text-xs text-tinta-tenue">
                  <CalendarOff className="size-3.5" />
                  Sin citas
                </p>
              )}
              <button
                onClick={() => alAnadirEnDia(clave)}
                className="w-full rounded-xl border border-dashed border-borde py-2 text-xs font-medium text-tinta-tenue transition-colors hover:border-marca-300 hover:bg-white hover:text-marca-600"
              >
                + Añadir
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CabeceraDia({ dia, hoyEs, atenuado = false }) {
  return (
    <div className="flex items-center gap-2 md:block">
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          hoyEs ? 'text-marca-600' : atenuado ? 'text-tinta-tenue' : 'text-tinta-suave'
        }`}
      >
        {DIAS_CORTOS[(dia.getDay() + 6) % 7]}
      </p>
      <p
        className={`text-lg font-semibold md:mt-0.5 ${
          hoyEs ? 'text-marca-600' : atenuado ? 'text-tinta-tenue' : 'text-tinta'
        }`}
      >
        {dia.getDate()}
        {hoyEs && <span className="ml-1.5 text-xs font-medium">hoy</span>}
      </p>
    </div>
  )
}
