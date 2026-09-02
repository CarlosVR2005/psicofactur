import { useEffect, useMemo, useState } from 'react'
import { GitMerge, TriangleAlert, UserRoundCheck } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import Cargando from '../../components/ui/Cargando'
import AvisoError from '../../components/ui/AvisoError'
import { MOTIVO } from '../../lib/duplicados'
import { camposQueCompletan } from '../../lib/pacientesCsv'
import { fusionarPacientes, historialDePaciente } from '../../services/pacientes'
import { fechaNumerica } from '../../lib/fechas'

/* ================================================================
   FUSIONAR FICHAS DUPLICADAS

   El grupo que llega es sólo una SUGERENCIA de fichas que se parecen.
   Aquí manda ella: marca cuáles son de verdad la misma persona (puede
   dejar fuera una que no lo sea) y elige cuál se queda. Sólo con lo
   marcado se llama a `fusionar_pacientes`, que mueve el histórico a la
   ficha elegida y borra las demás.

   El nombre de la ficha que se queda es el que sobrevive; por eso por
   defecto se marca la que más histórico tiene.
   ================================================================ */

/* Los campos que `camposQueCompletan` puede devolver, con su nombre
   para la pantalla. Para la vista previa de «qué se va a rellenar». */
const ETIQUETA_CAMPO = {
  dni: 'DNI',
  telefono: 'Teléfono',
  correo: 'Correo',
  fechaNacimiento: 'Fecha de nacimiento',
  inicioTerapia: 'Inicio de la terapia',
  observaciones: 'Observaciones',
  precioSesion: 'Precio por sesión',
  progenitor1Nombre: 'Progenitor 1 · Nombre',
  progenitor1Dni: 'Progenitor 1 · DNI',
  progenitor1Telefono: 'Progenitor 1 · Teléfono',
  progenitor1Correo: 'Progenitor 1 · Correo',
  progenitor2Nombre: 'Progenitor 2 · Nombre',
  progenitor2Dni: 'Progenitor 2 · DNI',
  progenitor2Telefono: 'Progenitor 2 · Teléfono',
  progenitor2Correo: 'Progenitor 2 · Correo',
}

export default function FusionarPacientesModal({
  abierto,
  alCerrar,
  grupo,
  alFusionado,
  alDescartar,
}) {
  const fichas = useMemo(() => grupo?.fichas ?? [], [grupo])

  const [historiales, setHistoriales] = useState(null) // { [id]: { citas, facturas } }
  const [cargando, setCargando] = useState(false)
  const [incluidos, setIncluidos] = useState(() => new Set())
  const [destinoId, setDestinoId] = useState(null)
  const [fusionando, setFusionando] = useState(false)
  const [error, setError] = useState(null)

  const peso = (id) =>
    (historiales?.[id]?.citas ?? 0) + (historiales?.[id]?.facturas ?? 0)

  /* Al abrir: pedir cuánto histórico tiene cada ficha, marcarlas todas y
     preseleccionar como «la que se queda» la que más tenga (empate: la
     más antigua). */
  useEffect(() => {
    if (!abierto || fichas.length === 0) return
    let vivo = true

    setHistoriales(null)
    setIncluidos(new Set())
    setDestinoId(null)
    setError(null)
    setCargando(true)

    Promise.all(fichas.map((f) => historialDePaciente(f.id))).then((resultados) => {
      if (!vivo) return
      const mapa = {}
      resultados.forEach(({ data }, i) => {
        mapa[fichas[i].id] = data ?? { citas: 0, facturas: 0 }
      })
      setHistoriales(mapa)
      setIncluidos(new Set(fichas.map((f) => f.id)))

      const ordenadas = [...fichas].sort(
        (a, b) =>
          (mapa[b.id].citas + mapa[b.id].facturas) -
            (mapa[a.id].citas + mapa[a.id].facturas) ||
          String(a.creadoEn ?? '').localeCompare(String(b.creadoEn ?? '')),
      )
      setDestinoId(ordenadas[0]?.id ?? fichas[0].id)
      setCargando(false)
    })

    return () => {
      vivo = false
    }
  }, [abierto, fichas])

  /* Si deja fuera la ficha que estaba marcada para quedarse, pasa la
     marca a otra de las que siguen dentro (la de más histórico). */
  useEffect(() => {
    if (!destinoId || incluidos.has(destinoId)) return
    const otra = [...incluidos].sort((a, b) => peso(b) - peso(a))[0] ?? null
    setDestinoId(otra)
  }, [incluidos, destinoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const destino = useMemo(
    () => fichas.find((f) => f.id === destinoId) ?? null,
    [fichas, destinoId],
  )
  const origenes = useMemo(
    () => fichas.filter((f) => incluidos.has(f.id) && f.id !== destinoId),
    [fichas, incluidos, destinoId],
  )

  const alternarIncluido = (id) => {
    setIncluidos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  /* Qué huecos de la ficha que se queda rellenarían las demás marcadas.
     Se encadena `camposQueCompletan` (misma regla que la importación:
     sólo huecos, nunca se pisa lo escrito). */
  const relleno = useMemo(() => {
    if (!destino) return {}
    let acumulado = { ...destino }
    let cambios = {}
    for (const origen of origenes) {
      const nuevos = camposQueCompletan(acumulado, origen)
      cambios = { ...cambios, ...nuevos }
      acumulado = { ...acumulado, ...nuevos }
    }
    return cambios
  }, [destino, origenes])

  const totalCitas = origenes.reduce((n, f) => n + (historiales?.[f.id]?.citas ?? 0), 0)
  const totalFacturas = origenes.reduce(
    (n, f) => n + (historiales?.[f.id]?.facturas ?? 0),
    0,
  )

  if (!grupo) return null

  const señal = MOTIVO[grupo.motivo]
  const puedeFusionar =
    !cargando && !fusionando && destinoId && incluidos.has(destinoId) && origenes.length > 0

  const fusionar = async () => {
    if (!puedeFusionar) return
    setError(null)
    setFusionando(true)
    const { data, error: fallo } = await fusionarPacientes(
      destinoId,
      origenes.map((f) => f.id),
    )
    setFusionando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    alFusionado?.({ destino, resumen: data })
  }

  const movido = []
  if (totalCitas > 0) movido.push(`${totalCitas} ${totalCitas === 1 ? 'cita' : 'citas'}`)
  if (totalFacturas > 0) {
    movido.push(`${totalFacturas} ${totalFacturas === 1 ? 'factura' : 'facturas'}`)
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Fusionar fichas"
      descripcion={
        fichas.length === 2
          ? 'Estas dos fichas parecen la misma persona.'
          : `Estas ${fichas.length} fichas parecen la misma persona.`
      }
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={fusionando}>
            Cancelar
          </Boton>
          <Boton
            variante="fantasma"
            onClick={() => {
              alDescartar?.(grupo)
              alCerrar()
            }}
            disabled={fusionando}
          >
            No son la misma persona
          </Boton>
          <Boton icono={GitMerge} onClick={fusionar} disabled={!puedeFusionar}>
            {fusionando
              ? 'Fusionando…'
              : origenes.length > 0
                ? `Fusionar ${origenes.length + 1} fichas`
                : 'Fusionar'}
          </Boton>
        </>
      }
    >
      {cargando || !historiales ? (
        <Cargando texto="Mirando el histórico de cada ficha…" />
      ) : (
        <div className="space-y-4">
          <AvisoError error={error} />

          <div className="flex items-center gap-2 text-sm text-tinta-suave">
            <span className="rounded-full bg-crema px-2.5 py-1 text-xs font-medium text-tinta">
              {señal.etiqueta}
            </span>
            {grupo.confianza === 'baja' && (
              <span className="text-tinta-tenue">emparejadas sólo por el nombre</span>
            )}
          </div>

          {grupo.confianza === 'baja' && (
            <div className="flex items-start gap-3 rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3.5 text-sm leading-relaxed text-ambar">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
              <p>
                No comparten DNI ni teléfono: se han juntado porque el nombre se
                parece. Deja fuera las que no sean la misma persona.
              </p>
            </div>
          )}

          <p className="text-sm text-tinta-suave">
            Marca las fichas que son la misma persona y elige cuál se queda. Su
            nombre y sus datos son los que mandan; los huecos que tenga se
            rellenan con los de las demás, sin pisar nada.
          </p>

          <div className="space-y-2.5">
            {fichas.map((f) => {
              const h = historiales[f.id] ?? { citas: 0, facturas: 0 }
              const incluida = incluidos.has(f.id)
              const esDestino = incluida && f.id === destinoId
              return (
                <div
                  key={f.id}
                  className={`rounded-2xl border transition-colors ${
                    esDestino
                      ? 'border-marca-400 bg-marca-50 ring-2 ring-marca-200'
                      : incluida
                        ? 'border-borde bg-white'
                        : 'border-borde bg-crema/40'
                  }`}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-marca-500"
                      checked={incluida}
                      onChange={() => alternarIncluido(f.id)}
                      aria-label={`Incluir a ${f.nombre} en la fusión`}
                    />
                    <div className={`min-w-0 flex-1 ${incluida ? '' : 'opacity-55'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-tinta wrap-anywhere">
                          {f.nombre}
                        </span>
                        {esDestino && (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-marca-500 px-2 py-0.5 text-xs font-medium text-white">
                            <UserRoundCheck className="size-3" strokeWidth={2.4} />
                            se queda
                          </span>
                        )}
                        {!f.activo && (
                          <span className="whitespace-nowrap rounded-full bg-crema px-2 py-0.5 text-xs text-tinta-tenue">
                            archivada
                          </span>
                        )}
                      </div>
                      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm text-tinta-suave">
                        <Dato etiqueta="DNI" valor={f.dni} />
                        <Dato etiqueta="Teléfono" valor={f.telefono} />
                        <Dato etiqueta="Correo" valor={f.correo} />
                        <Dato
                          etiqueta="Nacimiento"
                          valor={f.fechaNacimiento ? fechaNumerica(f.fechaNacimiento) : ''}
                        />
                      </dl>
                      <p className="mt-1.5 text-xs text-tinta-tenue">
                        {h.citas} {h.citas === 1 ? 'cita' : 'citas'} · {h.facturas}{' '}
                        {h.facturas === 1 ? 'factura' : 'facturas'}
                        {f.consentimientoEstado === 'FIRMADO' && ' · consentimiento firmado'}
                      </p>

                      {incluida && !esDestino && (
                        <button
                          type="button"
                          onClick={() => setDestinoId(f.id)}
                          className="mt-2 text-sm font-medium text-marca-700 hover:underline"
                        >
                          Que se quede esta
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {incluidos.size < 2 && (
            <p className="text-sm text-ambar">
              Marca al menos dos fichas para poder fusionarlas.
            </p>
          )}

          {Object.keys(relleno).length > 0 && (
            <div className="rounded-2xl border border-borde bg-crema/60 px-4 py-3.5">
              <p className="text-sm font-medium text-tinta">
                Se rellenará en la ficha de «{destino?.nombre}»
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-tinta-suave">
                {Object.entries(relleno).map(([campo, valor]) => (
                  <li key={campo}>
                    <span className="text-tinta">{ETIQUETA_CAMPO[campo] ?? campo}:</span>{' '}
                    {String(valor)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {origenes.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-borde bg-white px-4 py-3.5 text-sm leading-relaxed text-tinta">
              <GitMerge className="mt-0.5 size-5 shrink-0 text-tinta-tenue" strokeWidth={2} />
              <p>
                {movido.length > 0 ? (
                  <>
                    Se llevará <strong>{movido.join(' y ')}</strong> a la ficha de «
                    {destino?.nombre}», junto con su historia clínica y su lista de
                    espera.{' '}
                  </>
                ) : (
                  <>
                    Se moverá a la ficha de «{destino?.nombre}» la historia clínica y
                    la lista de espera de{' '}
                    {origenes.length === 1 ? 'la otra ficha' : 'las otras fichas'}.{' '}
                  </>
                )}
                {origenes.length === 1 ? 'La otra ficha' : 'Las otras fichas'} se
                {origenes.length === 1 ? '' : 'n'} borrará
                {origenes.length === 1 ? '' : 'n'}. Las facturas ya emitidas no se
                tocan.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="min-w-0">
      <span className="text-tinta-tenue">{etiqueta}: </span>
      <span className="wrap-anywhere">{valor || '—'}</span>
    </div>
  )
}
