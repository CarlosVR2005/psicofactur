import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowDownUp, GitMerge, Plus, UserRoundSearch, Users } from 'lucide-react'
import Cabecera from '../components/layout/Cabecera'
import Card from '../components/ui/Card'
import Buscador from '../components/ui/Buscador'
import Boton from '../components/ui/Boton'
import Segmentado from '../components/ui/Segmentado'
import EstadoVacio from '../components/ui/EstadoVacio'
import AvisoError from '../components/ui/AvisoError'
import Aviso from '../components/ui/Aviso'
import { EsqueletoLista } from '../components/ui/Cargando'
import PacienteFila from '../features/pacientes/PacienteFila'
import PacienteModal from '../features/pacientes/PacienteModal'
import ImportarExportarModal from '../features/pacientes/ImportarExportarModal'
import FusionarPacientesModal from '../features/pacientes/FusionarPacientesModal'
import { usePacientes } from '../hooks/usePacientes'
import { normalizar } from '../lib/formato'
import { esMenorDeEdad } from '../lib/menores'
import { gruposDuplicados } from '../lib/duplicados'

/* Firma estable de un grupo de duplicados: sus ids ordenados. Sirve
   para recordar, sólo mientras dura la sesión, los grupos que ella ha
   marcado como «no son la misma persona». */
const firmaGrupo = (grupo) =>
  grupo.fichas
    .map((f) => f.id)
    .sort()
    .join('|')

const VISTAS = [
  { id: 'activos', etiqueta: 'Activos' },
  { id: 'todos', etiqueta: 'Todos' },
]

/* Letra de agrupación del listado: sin tildes y en mayúscula; lo que no
   empieza por letra cae en «#». */
function primeraLetra(nombre) {
  const c = normalizar(nombre).trim()[0] ?? '#'
  return /[a-z]/.test(c) ? c.toUpperCase() : '#'
}

export default function PacientesPage() {
  const [vista, setVista] = useState('activos')
  const { pacientes, cargando, error, recargar, aplicarCambio } = usePacientes({
    incluirArchivados: vista === 'todos',
  })

  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [traspasoAbierto, setTraspasoAbierto] = useState(false)
  const [aviso, setAviso] = useState(null)

  /* Fichas que parecen la misma persona. Se calcula sobre la lista ya
     cargada, así que no cuesta ninguna consulta. Los grupos que ella
     descarta se recuerdan sólo hasta que recargue la página. */
  const [descartados, setDescartados] = useState(() => new Set())
  const [grupoFusion, setGrupoFusion] = useState(null)

  const duplicados = useMemo(() => {
    if (pacientes.length < 2) return []
    return gruposDuplicados(pacientes).filter((g) => !descartados.has(firmaGrupo(g)))
  }, [pacientes, descartados])

  /* Al volver de borrar una ficha, la pantalla de detalle deja el aviso
     en `location.state`. Se recoge una vez y se limpia del historial
     para que no reaparezca al recargar o al navegar atrás. */
  const location = useLocation()
  const navegar = useNavigate()
  useEffect(() => {
    if (location.state?.aviso) {
      setAviso(location.state.aviso)
      navegar(location.pathname, { replace: true, state: null })
    }
  }, [location, navegar])

  const resultados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (!q) return pacientes
    // Busca por nombre y, de paso, por DNI o teléfono: es lo que se tiene a mano
    return pacientes.filter(
      (p) =>
        normalizar(p.nombre).includes(q) ||
        normalizar(p.dni).includes(q) ||
        p.telefono.includes(q.replace(/\s/g, '')),
    )
  }, [pacientes, busqueda])

  /* Con búsqueda no se agrupa: hay pocas líneas y el orden alfabético
     estorba más que ayuda. Sin ella, una sección por inicial. */
  const grupos = useMemo(() => {
    if (busqueda) return [{ letra: null, filas: resultados }]
    const mapa = new Map()
    for (const p of resultados) {
      const l = primeraLetra(p.nombre)
      if (!mapa.has(l)) mapa.set(l, [])
      mapa.get(l).push(p)
    }
    return [...mapa.entries()].map(([letra, filas]) => ({ letra, filas }))
  }, [resultados, busqueda])

  const activos = pacientes.filter((p) => p.activo).length
  const menores = pacientes.filter(
    (p) => p.activo && esMenorDeEdad(p.fechaNacimiento),
  ).length

  return (
    <>
      <Cabecera
        titulo="Pacientes"
        subtitulo={
          cargando
            ? 'Cargando…'
            : `${activos} ${activos === 1 ? 'paciente' : 'pacientes'}` +
              (menores ? ` · ${menores} ${menores === 1 ? 'menor' : 'menores'}` : '')
        }
        accion={
          <div className="flex items-center gap-2">
            {/* Traspasar la lista es cosa de un día (al llegar y al irse),
                así que va discreto al lado de la acción de todos los días */}
            <Boton
              variante="secundario"
              icono={ArrowDownUp}
              onClick={() => setTraspasoAbierto(true)}
              title="Importar pacientes de otro programa o exportar los tuyos"
              aria-label="Importar y exportar pacientes"
            >
              {/* En el móvil sólo el icono: la fila se comparte con «Nuevo
                  paciente», que es la acción de verdad de esta pantalla */}
              <span className="hidden sm:inline">Importar / Exportar</span>
            </Boton>
            <Boton icono={Plus} onClick={() => setModalAbierto(true)}>
              Nuevo paciente
            </Boton>
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Buscador
              valor={busqueda}
              alCambiar={setBusqueda}
              placeholder="Buscar por nombre, DNI o teléfono…"
            />
          </div>
          <Segmentado opciones={VISTAS} valor={vista} alCambiar={setVista} />
        </div>
      </Cabecera>

      <AvisoError error={error} alReintentar={recargar} className="mb-4" />

      {duplicados.length > 0 && !cargando && (
        <button
          type="button"
          onClick={() => setGrupoFusion(duplicados[0])}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3 text-left transition-colors hover:bg-ambar-suave/70"
        >
          <GitMerge className="size-5 shrink-0 text-ambar" strokeWidth={2} />
          <span className="min-w-0 flex-1 text-sm text-tinta">
            {duplicados.length === 1
              ? `${duplicados[0].fichas.length} fichas parecen la misma persona.`
              : `${duplicados.length} grupos de fichas parecen repetidas.`}{' '}
            <span className="text-tinta-suave">Revísalas y fusiónalas si lo son.</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-marca-700">Revisar</span>
        </button>
      )}

      {cargando ? (
        <EsqueletoLista filas={6} />
      ) : resultados.length === 0 ? (
        busqueda ? (
          <EstadoVacio
            icono={UserRoundSearch}
            titulo="Ningún paciente coincide"
            texto={`No hay resultados para «${busqueda}». Prueba con menos letras.`}
            accion={
              <Boton variante="secundario" onClick={() => setBusqueda('')}>
                Ver todos
              </Boton>
            }
          />
        ) : (
          <EstadoVacio
            icono={Users}
            titulo="Todavía no hay pacientes"
            texto="Cuando añadas el primero aparecerá aquí, con su ficha y su histórico."
            accion={
              <Boton icono={Plus} onClick={() => setModalAbierto(true)}>
                Añadir el primer paciente
              </Boton>
            }
          />
        )
      ) : (
        <>
          {busqueda && (
            <p className="mb-3 text-sm text-tinta-suave">
              {resultados.length}{' '}
              {resultados.length === 1 ? 'resultado' : 'resultados'}
            </p>
          )}
          <div className="space-y-5">
            {grupos.map(({ letra, filas }) => (
              <section key={letra ?? 'resultados'}>
                {letra && (
                  <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
                    {letra}
                  </h2>
                )}
                <Card className="divide-y divide-borde overflow-hidden p-0">
                  {filas.map((p) => (
                    <PacienteFila key={p.id} paciente={p} />
                  ))}
                </Card>
              </section>
            ))}
          </div>
        </>
      )}

      <PacienteModal
        abierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        alGuardar={aplicarCambio}
        otrosPacientes={pacientes}
      />

      <ImportarExportarModal
        abierto={traspasoAbierto}
        alCerrar={() => setTraspasoAbierto(false)}
        alRecargar={recargar}
        alAvisar={setAviso}
      />

      <FusionarPacientesModal
        abierto={Boolean(grupoFusion)}
        grupo={grupoFusion}
        alCerrar={() => setGrupoFusion(null)}
        alDescartar={(grupo) =>
          setDescartados((s) => new Set(s).add(firmaGrupo(grupo)))
        }
        alFusionado={({ destino, resumen }) => {
          setGrupoFusion(null)
          const movido = []
          if (resumen.citas) movido.push(`${resumen.citas} ${resumen.citas === 1 ? 'cita' : 'citas'}`)
          if (resumen.facturas) {
            movido.push(`${resumen.facturas} ${resumen.facturas === 1 ? 'factura' : 'facturas'}`)
          }
          if (resumen.entradas) {
            movido.push(
              `${resumen.entradas} ${resumen.entradas === 1 ? 'entrada de la historia' : 'entradas de la historia'}`,
            )
          }
          setAviso({
            tipo: 'exito',
            titulo: `Fichas fusionadas en «${destino?.nombre}»`,
            detalle: movido.length > 0 ? `Se ${movido.length === 1 ? 'ha movido' : 'han movido'} ${movido.join(', ')}.` : undefined,
          })
          recargar()
        }}
      />

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}
