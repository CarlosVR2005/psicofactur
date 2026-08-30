import { Plus } from 'lucide-react'
import ListaDelDia from './ListaDelDia'
import { aClave, DIAS_CORTOS, esHoy } from '../../lib/fechas'

/* Semana de un vistazo.
   Escritorio: una columna por día. Móvil: lista vertical por días,
   que es como se lee de verdad la agenda con el teléfono en la mano.

   Los días sin citas no gritan: una sola caja «Libre» que al pasar por
   encima (o tocar) ofrece añadir. Antes cada día vacío traía dos cajas
   punteadas —«Sin citas» y «+ Añadir»— y siete de esas llenaban de
   ruido una semana tranquila. */
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
        const vacio = citas.length === 0

        // Los findes vacíos no ocupan sitio en el móvil
        const claseColumna = [
          finde && vacio ? 'hidden md:block' : '',
          hoyEs ? 'rounded-2xl bg-marca-50/60 p-2 md:p-1.5' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div key={clave} className={claseColumna || undefined}>
            <CabeceraDia dia={dia} hoyEs={hoyEs} atenuado={finde && vacio} />

            {vacio ? (
              <BotonLibre className="mt-2" onClick={() => alAnadirEnDia(clave)} />
            ) : (
              <div className="mt-2 space-y-2">
                <ListaDelDia
                  citas={citas}
                  alPulsarCita={alPulsarCita}
                  alAnadirAlHueco={(hora) => alAnadirEnDia(clave, hora)}
                  compacto
                />
                <button
                  onClick={() => alAnadirEnDia(clave)}
                  className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-borde py-2 text-xs font-medium text-tinta-tenue transition-colors hover:border-marca-300 hover:bg-white hover:text-marca-600 md:opacity-60 md:hover:opacity-100"
                >
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  Añadir
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* La caja de un día sin citas: un solo destino. Dice «Libre» en reposo
   y «Añadir» al pasar por encima o enfocarlo; el «+» está siempre para
   que se lea como algo que se puede pulsar, también con el dedo. */
function BotonLibre({ onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-borde py-6 text-xs font-medium text-tinta-tenue transition-colors hover:border-marca-300 hover:bg-white hover:text-marca-600 ${className}`}
    >
      <Plus className="size-3.5" strokeWidth={2.5} />
      <span className="group-hover:hidden group-focus-visible:hidden">Libre</span>
      <span className="hidden group-hover:inline group-focus-visible:inline">Añadir</span>
    </button>
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
