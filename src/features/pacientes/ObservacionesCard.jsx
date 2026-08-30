import { useEffect, useState } from 'react'
import { NotebookPen, Pencil } from 'lucide-react'
import Card from '../../components/ui/Card'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { AreaTexto } from '../../components/ui/Campo'
import { actualizarObservaciones } from '../../services/pacientes'

/**
 * Tarjeta de observaciones con edición en línea: se cambian aquí mismo
 * sin abrir el modal de la ficha entera.
 *
 * @param {object}   props.paciente
 * @param {function} props.alGuardar  recibe el paciente ya actualizado
 */
export default function ObservacionesCard({ paciente, alGuardar }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(paciente.observaciones || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  // Si cambian las observaciones desde fuera y no se está editando, el
  // textarea sigue el valor de la ficha.
  useEffect(() => {
    if (!editando) setTexto(paciente.observaciones || '')
  }, [paciente.observaciones, editando])

  const abrir = () => {
    setError(null)
    setTexto(paciente.observaciones || '')
    setEditando(true)
  }

  const cancelar = () => {
    setError(null)
    setEditando(false)
  }

  const guardar = async () => {
    if (texto.trim() === (paciente.observaciones || '').trim()) {
      setEditando(false)
      return
    }
    setError(null)
    setGuardando(true)
    const { data, error: fallo } = await actualizarObservaciones(paciente.id, texto)
    setGuardando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    alGuardar?.(data)
    setEditando(false)
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-tinta">
          <NotebookPen className="size-4.5 text-tinta-tenue" strokeWidth={1.9} />
          Observaciones
        </h2>
        {!editando && (
          <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={abrir}>
            Editar
          </Boton>
        )}
      </div>

      {editando ? (
        <div className="space-y-3">
          <AvisoError error={error} />
          <AreaTexto
            autoFocus
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Motivo de consulta, preferencias de horario…"
          />
          <div className="flex justify-end gap-2">
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={cancelar}
              disabled={guardando}
            >
              Cancelar
            </Boton>
            <Boton tamano="sm" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line leading-relaxed text-tinta-suave">
          {paciente.observaciones || 'Sin observaciones todavía.'}
        </p>
      )}
    </Card>
  )
}
