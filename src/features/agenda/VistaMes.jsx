import { aClave, DIAS_CORTOS, esHoy, semanasDelMes } from '../../lib/fechas'

/* En el mes el punto dice la CONFIRMACIÓN del paciente, no el tipo de
   sesión: de un vistazo se ve qué días están cerrados y cuáles tienen
   gente sin responder. El tipo se ve al tocar el día. */
const PUNTO_CONFIRMACION = {
  confirmada: 'bg-verde',
  pendiente: 'bg-ambar',
  cancelada: 'bg-transparent ring-1 ring-inset ring-rojo/60',
}

/* Vista de mes: cuadrícula con un punto de color por cita.
   Se toca un día y abajo se abre el detalle de ese día. */
export default function VistaMes({ mes, citasPorDia, diaElegido, alElegirDia }) {
  const semanas = semanasDelMes(mes)

  return (
    <div className="overflow-hidden rounded-2xl border border-borde bg-white shadow-suave">
      <div className="grid grid-cols-7 border-b border-borde bg-crema/60">
        {DIAS_CORTOS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-tinta-tenue"
          >
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {semanas.flat().map((dia) => {
          const clave = aClave(dia)
          const citas = citasPorDia.get(clave) ?? []
          const sinConfirmar = citas.filter((c) => c.confirmacion === 'pendiente').length
          const delMes = dia.getMonth() === mes.getMonth()
          const elegido = clave === diaElegido
          const hoyEs = esHoy(clave)

          return (
            <button
              key={clave}
              onClick={() => alElegirDia(clave)}
              aria-current={hoyEs ? 'date' : undefined}
              className={`flex min-h-[4.25rem] flex-col items-center gap-1 border-b border-r border-borde/70 p-1.5 transition-colors [&:nth-child(7n)]:border-r-0 sm:min-h-[6rem] sm:items-start sm:p-2 ${
                delMes ? 'bg-white' : 'bg-crema/40'
              } ${elegido ? 'ring-2 ring-inset ring-marca-400' : 'hover:bg-marca-50/50'}`}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full text-sm font-medium ${
                  hoyEs
                    ? 'bg-marca-500 text-white'
                    : delMes
                      ? 'text-tinta'
                      : 'text-tinta-tenue'
                }`}
              >
                {dia.getDate()}
              </span>

              {/* Un punto por cita (hasta 4), coloreado por confirmación */}
              <span className="flex flex-wrap justify-center gap-1 sm:justify-start">
                {citas.slice(0, 4).map((c) => (
                  <span
                    key={c.id}
                    className={`size-1.5 rounded-full sm:size-2 ${
                      PUNTO_CONFIRMACION[c.confirmacion] ?? 'bg-ambar'
                    }`}
                  />
                ))}
                {citas.length > 4 && (
                  <span className="text-[0.6rem] font-medium leading-none text-tinta-tenue">
                    +{citas.length - 4}
                  </span>
                )}
              </span>

              {/* En escritorio cabe el recuento escrito */}
              {citas.length > 0 && (
                <span className="mt-auto hidden text-xs sm:block">
                  <span className="text-tinta-tenue">
                    {citas.length} {citas.length === 1 ? 'cita' : 'citas'}
                  </span>
                  {sinConfirmar > 0 && (
                    <span className="text-ambar"> · {sinConfirmar} sin confirmar</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
