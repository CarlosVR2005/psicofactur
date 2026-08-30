import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { eliminarEntrada } from '../../services/historia'
import { fechaNumerica } from '../../lib/fechas'

/* Borrar una entrada de la historia clínica se lleva por delante sus
   documentos y no se puede deshacer. Se confirma siempre y se dice
   cuántos documentos van con ella. */
export default function EliminarEntradaModal({ abierto, alCerrar, entrada, alEliminado }) {
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState(null)

  if (!entrada) return null

  const nDocs = entrada.adjuntos?.length ?? 0

  const eliminar = async () => {
    setError(null)
    setEliminando(true)
    const { error: fallo } = await eliminarEntrada(entrada)
    setEliminando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    alEliminado?.(entrada.id)
    alCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Eliminar entrada"
      descripcion={`${fechaNumerica(entrada.fecha)} · ${entrada.titulo}`}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={eliminando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={eliminar} disabled={eliminando}>
            {eliminando ? 'Eliminando…' : 'Eliminar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <AvisoError error={error} />
        <div className="flex items-start gap-3 rounded-2xl border border-rojo/30 bg-rojo-suave px-4 py-3.5 text-sm leading-relaxed text-rojo">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <p>
            Esto no se puede deshacer. Se borrará el texto de la entrada
            {nDocs > 0 && (
              <>
                {' '}
                y sus {nDocs === 1 ? 'documento adjunto' : `${nDocs} documentos adjuntos`}
              </>
            )}
            .
          </p>
        </div>
      </div>
    </Modal>
  )
}
