import { aClave, DIAS_CORTOS, esHoy, semanasDelMes } from '../../lib/fechas'

/* En el mes el punto dice la CONFIRMACIÓN del paciente, no el tipo de
   sesión: de un vistazo se ve qué días están cerrados y cuáles tienen
   gente sin responder. El tipo se ve al tocar el día. */
const PUNTO_CONFIRMACION = {
  confirmada: 'bg-verde',
  pendiente: 'bg-ambar',
  cancelada: 'bg-transparent ring-1 ring-inset ring-rojo/60',
}

function primerNombre(nombre = '') {
  return nombre.split(' ')[0]
}

/* Vista de mes: cuadrícula de días.
   En el móvil no cabe más que un punto por cita (coloreado por
   confirmación). En escritorio sí hay sitio, así que cada día enseña
   sus primeras citas con hora y nombre —mucho más útil que un
   «3 citas»— y remata con lo que queda y lo que falta por confirmar.
   Se toca un día y abajo se abre su detalle completo. */
export default function VistaMes({ mes, citasPorDia, diaElegido, alElegirDia }) {
  const semanas = semanasDelMes(mes)

  return (
    <div className="overflow-hidden rounded-2xl border border-borde bg-white shadow-suave">
      <div className="grid grid-cols-7 border-b border-borde">
        {DIAS_CORTOS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-tinta-tenue"
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
          const visibles = citas.slice(0, 3)
          const resto = citas.length - visibles.length

          return (
            <button
              key={clave}
              onClick={() => alElegirDia(clave)}
              aria-current={hoyEs ? 'date' : undefined}
              className={`flex min-h-[4.25rem] flex-col gap-1 border-b border-r border-borde/70 p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0 sm:min-h-[7rem] sm:p-2 ${
                delMes ? 'bg-white' : 'bg-crema/30'
              } ${
                elegido
                  ? 'bg-marca-50/60 ring-1 ring-inset ring-marca-400'
                  : 'hover:bg-marca-50/40'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    hoyEs
                      ? 'bg-marca-500 text-white'
                      : delMes
                        ? 'text-tinta'
                        : 'text-tinta-tenue'
                  }`}
                >
                  {dia.getDate()}
                </span>

                {/* Móvil: un punto por cita (hasta 4), coloreado por confirmación */}
                <span className="flex flex-wrap gap-1 sm:hidden">
                  {citas.slice(0, 4).map((c) => (
                    <span
                      key={c.id}
                      className={`size-1.5 rounded-full ${
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
              </span>

              {/* Escritorio: las primeras citas con hora y nombre */}
              {citas.length > 0 && (
                <span className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex">
                  {visibles.map((c) => (
                    <span key={c.id} className="flex items-center gap-1 text-xs">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          PUNTO_CONFIRMACION[c.confirmacion] ?? 'bg-ambar'
                        }`}
                      />
                      <span className="shrink-0 tabular-nums text-tinta-suave">{c.hora}</span>
                      <span
                        className={`truncate ${
                          c.confirmacion === 'cancelada'
                            ? 'text-tinta-tenue line-through'
                            : 'text-tinta'
                        }`}
                      >
                        {primerNombre(c.pacienteNombre)}
                      </span>
                    </span>
                  ))}

                  {(resto > 0 || sinConfirmar > 0) && (
                    <span className="mt-auto flex flex-wrap gap-x-1.5 pt-0.5 text-[0.68rem] font-medium">
                      {resto > 0 && <span className="text-tinta-tenue">+{resto} más</span>}
                      {sinConfirmar > 0 && (
                        <span className="text-ambar">{sinConfirmar} sin confirmar</span>
                      )}
                    </span>
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
