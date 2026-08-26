import { useEffect, useState } from 'react'
import { CalendarClock, Check, Loader2, Plus, X } from 'lucide-react'
import Card from '../../components/ui/Card'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { Entrada } from '../../components/ui/Campo'
import { getHorarioTrabajo, guardarHorarioTrabajo } from '../../services/ajustes'
import { DIAS_SEMANA } from '../../lib/espera'

/* ================================================================
   Horario de trabajo, día a día.

   No es sólo un dato informativo: es lo que usa la lista de espera para
   calcular huecos libres de verdad (ver `lib/espera.js`), en vez de
   ofrecer sólo los ratos que deja una cita cancelada. Sin esto puesto,
   la lista sigue funcionando como antes.
   ================================================================ */

const TRAMO_POR_DEFECTO = () => ({ desde: '09:00', hasta: '14:00' })

export default function HorarioTrabajo({ alAvisar }) {
  const [horario, setHorario] = useState(null)
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getHorarioTrabajo().then(({ data, error: fallo }) => {
      if (fallo) setError(fallo)
      if (data) {
        setHorario(data)
        setForm(data)
      }
    })
  }, [])

  if (!form) return null

  const cambiado = JSON.stringify(form) !== JSON.stringify(horario)
  // Un tramo con la hora de fin antes (o igual) que la de inicio no forma un hueco
  const valido = DIAS_SEMANA.every(
    (dia) =>
      !form[dia.id].trabaja ||
      (form[dia.id].tramos.length > 0 &&
        form[dia.id].tramos.every((t) => t.desde < t.hasta)),
  )

  const cambiarDia = (diaId, siguiente) => setForm((f) => ({ ...f, [diaId]: siguiente }))

  const marcarTrabaja = (diaId, trabaja) => {
    const dia = form[diaId]
    cambiarDia(diaId, {
      trabaja,
      tramos: trabaja && dia.tramos.length === 0 ? [TRAMO_POR_DEFECTO()] : dia.tramos,
    })
  }

  const cambiarTramo = (diaId, indice, clave, valor) => {
    const dia = form[diaId]
    cambiarDia(diaId, {
      ...dia,
      tramos: dia.tramos.map((t, i) => (i === indice ? { ...t, [clave]: valor } : t)),
    })
  }

  const anadirTramo = (diaId) => {
    const dia = form[diaId]
    cambiarDia(diaId, { ...dia, tramos: [...dia.tramos, TRAMO_POR_DEFECTO()] })
  }

  const quitarTramo = (diaId, indice) => {
    const dia = form[diaId]
    cambiarDia(diaId, { ...dia, tramos: dia.tramos.filter((_, i) => i !== indice) })
  }

  const guardar = async () => {
    if (guardando || !valido || !cambiado) return
    setError(null)
    setGuardando(true)
    const { data, error: fallo } = await guardarHorarioTrabajo(form)
    setGuardando(false)

    if (fallo) {
      setError(fallo)
      return
    }
    setHorario(data)
    setForm(data)
    alAvisar?.({ tipo: 'exito', titulo: 'Horario guardado' })
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-marca-50 p-2 text-marca-700">
          <CalendarClock className="size-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-tinta">Horario de trabajo</h2>
          <p className="mt-0.5 text-sm text-tinta-suave">
            Con esto puesto, la lista de espera sugiere también los ratos que nunca se
            han ocupado, no sólo los que deja una cita cancelada.
          </p>
        </div>
      </div>

      <AvisoError error={error} className="mt-4" />

      <div className="mt-5 divide-y divide-borde">
        {DIAS_SEMANA.map((dia) => (
          <FilaDia
            key={dia.id}
            dia={dia}
            valor={form[dia.id]}
            disabled={guardando}
            alCambiarTrabaja={(trabaja) => marcarTrabaja(dia.id, trabaja)}
            alCambiarTramo={(indice, clave, valor) => cambiarTramo(dia.id, indice, clave, valor)}
            alAnadirTramo={() => anadirTramo(dia.id)}
            alQuitarTramo={(indice) => quitarTramo(dia.id, indice)}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {!cambiado && (
          <span className="inline-flex items-center gap-1.5 text-sm text-verde">
            <Check className="size-4" strokeWidth={2.2} />
            Guardado
          </span>
        )}
        <Boton onClick={guardar} disabled={guardando || !valido || !cambiado}>
          {guardando && <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />}
          Guardar horario
        </Boton>
      </div>
    </Card>
  )
}

function FilaDia({
  dia,
  valor,
  disabled,
  alCambiarTrabaja,
  alCambiarTramo,
  alAnadirTramo,
  alQuitarTramo,
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={valor.trabaja}
          onChange={(e) => alCambiarTrabaja(e.target.checked)}
          disabled={disabled}
          className="size-4 shrink-0 accent-marca-500"
        />
        <span className="w-24 shrink-0 font-medium text-tinta">{dia.etiqueta}</span>
        {!valor.trabaja && <span className="text-sm text-tinta-tenue">No trabaja</span>}
      </label>

      {valor.trabaja && (
        <div className="mt-2.5 ml-7 space-y-2">
          {valor.tramos.map((tramo, indice) => {
            const invalido = tramo.desde >= tramo.hasta
            return (
              <div key={indice} className="flex flex-wrap items-center gap-2">
                <Entrada
                  type="time"
                  value={tramo.desde}
                  onChange={(e) => alCambiarTramo(indice, 'desde', e.target.value)}
                  disabled={disabled}
                  aria-invalid={invalido}
                  className={`w-auto py-1.5 ${invalido ? 'border-rojo' : ''}`}
                />
                <span className="text-sm text-tinta-tenue">a</span>
                <Entrada
                  type="time"
                  value={tramo.hasta}
                  onChange={(e) => alCambiarTramo(indice, 'hasta', e.target.value)}
                  disabled={disabled}
                  aria-invalid={invalido}
                  className={`w-auto py-1.5 ${invalido ? 'border-rojo' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => alQuitarTramo(indice)}
                  disabled={disabled}
                  title="Quitar este tramo"
                  className="rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-rojo-suave hover:text-rojo disabled:opacity-40"
                >
                  <X className="size-4" strokeWidth={2} />
                  <span className="sr-only">Quitar tramo</span>
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={alAnadirTramo}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-sm font-medium text-marca-600 transition-colors hover:text-marca-700 disabled:opacity-40"
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
            Añadir tramo
          </button>
        </div>
      )}
    </div>
  )
}
