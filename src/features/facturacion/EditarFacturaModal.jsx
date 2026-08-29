import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import { Campo, Entrada } from '../../components/ui/Campo'
import { editarBorradorFactura } from '../../services/facturas'
import { euros } from '../../lib/formato'

/* Retocar una factura mientras todavía es un borrador.

   Sólo se toca el importe: la fecha de emisión no se ofrece porque la
   pone al día de hoy la Edge Function al emitir, así que cambiarla aquí
   no serviría de nada. Una vez la factura sale hacia Hacienda este botón
   desaparece —lo que queda entonces es rectificarla. */
export default function EditarFacturaModal({ factura, abierto, alCerrar, alGuardar, alFallar }) {
  const [importe, setImporte] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  // Al abrir, precargar con el importe actual
  useEffect(() => {
    if (abierto && factura) setImporte(String(factura.importe ?? ''))
  }, [abierto, factura])

  if (!factura) return null

  const importeNum = Number(importe)
  const valido = importe !== '' && importeNum > 0
  const sinCambios = importeNum === Number(factura.importe)

  const cerrar = () => {
    if (trabajando) return
    alCerrar()
  }

  const guardar = async () => {
    if (!valido || sinCambios || trabajando) return
    setTrabajando(true)
    const { data, error } = await editarBorradorFactura(factura.id, { importe: importeNum })
    setTrabajando(false)

    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }

    alGuardar?.({
      tipo: 'exito',
      titulo: `Factura ${data.numero} actualizada`,
      detalle: `Nuevo importe: ${euros(data.importe)}`,
      factura: data,
    })
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={cerrar}
      titulo={`Editar la factura ${factura.numero}`}
      descripcion={`${factura.pacienteNombre} · ${euros(factura.importe)}`}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={!valido || sinCambios || trabajando}>
            {trabajando && <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />}
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <p className="rounded-xl bg-crema px-4 py-3 text-sm text-tinta-suave">
          Esto sólo se puede hacer mientras la factura es un{' '}
          <strong className="text-tinta">borrador</strong>. Una vez registrada en
          Hacienda ya no se edita: habría que rectificarla.
        </p>

        <Campo
          etiqueta="Importe"
          ayuda={`Lo que se le cobra al paciente por la sesión. Ahora pone ${euros(factura.importe)}.`}
        >
          <Entrada
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            disabled={trabajando}
            autoFocus
          />
        </Campo>
      </div>
    </Modal>
  )
}
