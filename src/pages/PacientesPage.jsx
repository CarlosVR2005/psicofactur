import { useMemo, useState } from 'react'
import { Plus, UserRoundSearch, Users } from 'lucide-react'
import Cabecera from '../components/layout/Cabecera'
import Buscador from '../components/ui/Buscador'
import Boton from '../components/ui/Boton'
import Segmentado from '../components/ui/Segmentado'
import EstadoVacio from '../components/ui/EstadoVacio'
import AvisoError from '../components/ui/AvisoError'
import { EsqueletoLista } from '../components/ui/Cargando'
import PacienteCard from '../features/pacientes/PacienteCard'
import PacienteModal from '../features/pacientes/PacienteModal'
import { usePacientes } from '../hooks/usePacientes'
import { normalizar } from '../lib/formato'

const VISTAS = [
  { id: 'activos', etiqueta: 'En activo' },
  { id: 'todos', etiqueta: 'Con archivados' },
]

export default function PacientesPage() {
  const [vista, setVista] = useState('activos')
  const { pacientes, cargando, error, recargar, aplicarCambio } = usePacientes({
    incluirArchivados: vista === 'todos',
  })

  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)

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

  const activos = pacientes.filter((p) => p.activo).length

  return (
    <>
      <Cabecera
        titulo="Pacientes"
        subtitulo={
          cargando
            ? 'Cargando…'
            : `${activos} ${activos === 1 ? 'paciente' : 'pacientes'} en la consulta`
        }
        accion={
          <Boton icono={Plus} onClick={() => setModalAbierto(true)}>
            Nuevo paciente
          </Boton>
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
          <div className="space-y-2.5">
            {resultados.map((p) => (
              <PacienteCard key={p.id} paciente={p} />
            ))}
          </div>
        </>
      )}

      <PacienteModal
        abierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        alGuardar={aplicarCambio}
      />
    </>
  )
}
