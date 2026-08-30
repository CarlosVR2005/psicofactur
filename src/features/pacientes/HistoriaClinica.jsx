import { useState } from 'react'
import { NotebookPen, Plus } from 'lucide-react'
import Boton from '../../components/ui/Boton'
import Cargando from '../../components/ui/Cargando'
import AvisoError from '../../components/ui/AvisoError'
import EstadoVacio from '../../components/ui/EstadoVacio'
import { useHistoria } from '../../hooks/useHistoria'
import EntradaHistoriaCard from './EntradaHistoriaCard'
import EntradaHistoriaModal from './EntradaHistoriaModal'
import EliminarEntradaModal from './EliminarEntradaModal'

/* ================================================================
   HISTORIA CLÍNICA — la pestaña de la ficha del paciente

   La línea de tiempo de entradas fechadas, cada una con su texto y sus
   documentos. Se cargan todas de una vez: una consulta de psicología
   tiene decenas de sesiones por paciente, no miles. Si algún día
   creciera, se paginaría igual que se hizo con las facturas.
   ================================================================ */
export default function HistoriaClinica({ paciente }) {
  const { entradas, cargando, error, recargar, aplicarCambio, quitar } =
    useHistoria(paciente.id)
  // null = cerrado · 'nueva' = alta · objeto = edición de esa entrada
  const [editando, setEditando] = useState(null)
  const [eliminando, setEliminando] = useState(null)

  return (
    <>
      {/* La pestaña ya dice «Historia clínica»; aquí sólo el recuento y
          la acción, sin repetir el título ni meterlo en una tarjeta. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-suave">
          {entradas.length === 0
            ? 'Registro cronológico de la evolución del paciente.'
            : `${entradas.length} ${entradas.length === 1 ? 'entrada' : 'entradas'}`}
        </p>
        <Boton icono={Plus} onClick={() => setEditando('nueva')}>
          Nueva entrada
        </Boton>
      </div>

      <AvisoError error={error} alReintentar={recargar} className="mt-4" />

      {cargando ? (
        <Cargando texto="Cargando la historia…" />
      ) : entradas.length === 0 && !error ? (
        <div className="mt-4">
          <EstadoVacio
            icono={NotebookPen}
            titulo="Todavía no hay ninguna entrada"
            texto="Apunta la primera consulta, la evolución de una sesión o adjunta un informe."
            accion={
              <Boton icono={Plus} onClick={() => setEditando('nueva')}>
                Nueva entrada
              </Boton>
            }
          />
        </div>
      ) : (
        <ol className="mt-4 space-y-4">
          {entradas.map((entrada) => (
            <li key={entrada.id}>
              <EntradaHistoriaCard
                entrada={entrada}
                alEditar={() => setEditando(entrada)}
                alEliminar={() => setEliminando(entrada)}
              />
            </li>
          ))}
        </ol>
      )}

      <EntradaHistoriaModal
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        paciente={paciente}
        entrada={editando === 'nueva' ? null : editando}
        alGuardar={aplicarCambio}
      />

      <EliminarEntradaModal
        abierto={eliminando !== null}
        alCerrar={() => setEliminando(null)}
        entrada={eliminando}
        alEliminado={quitar}
      />
    </>
  )
}
