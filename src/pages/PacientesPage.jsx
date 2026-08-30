import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowDownUp, Plus, UserRoundSearch, Users } from 'lucide-react'
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
import { usePacientes } from '../hooks/usePacientes'
import { normalizar } from '../lib/formato'
import { esMenorDeEdad } from '../lib/menores'

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
      />

      <ImportarExportarModal
        abierto={traspasoAbierto}
        alCerrar={() => setTraspasoAbierto(false)}
        alRecargar={recargar}
        alAvisar={setAviso}
      />

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}
