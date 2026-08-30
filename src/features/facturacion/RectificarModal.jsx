import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import { Campo, Entrada, AreaTexto } from '../../components/ui/Campo'
import { rectificarFactura } from '../../services/verifacti'
import { rectificarFacturaLocal } from '../../services/facturas'
import { euros } from '../../lib/formato'

/* ================================================================
   Rectificar una factura.

   Lo que más importa de esta pantalla no es el formulario: es que se
   entienda qué va a pasar. Rectificar no corrige la factura que está
   mal —eso no se puede—, sino que emite otra nueva que la sustituye, y
   deja la primera anulada pero visible. Si eso no queda claro antes de
   pulsar, el resultado (dos facturas donde había una) parece un error
   de la aplicación.

   El motivo es obligatorio porque va a Hacienda como la descripción de
   la rectificativa, no es un campo de notas interno.
   ================================================================ */
export default function RectificarModal({
  factura,
  verifactuActivo = false,
  abierto,
  alCerrar,
  alRectificar,
  alFallar,
}) {
  const [importe, setImporte] = useState('')
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  if (!factura) return null

  const importeCorregido = importe === '' ? factura.importe : Number(importe)
  const valido = Number(importeCorregido) > 0 && motivo.trim().length > 0

  const cerrar = () => {
    if (trabajando) return
    setImporte('')
    setMotivo('')
    alCerrar()
  }

  const enviar = async () => {
    if (!valido || trabajando) return
    setTrabajando(true)
    const { data, error } = verifactuActivo
      ? await rectificarFactura({
          facturaId: factura.id,
          importe: importeCorregido,
          motivo,
        })
      : await rectificarFacturaLocal({
          facturaId: factura.id,
          importe: importeCorregido,
          motivo,
        })
    setTrabajando(false)

    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }

    setImporte('')
    setMotivo('')
    alRectificar?.({
      tipo: 'exito',
      titulo: `Factura ${data.numero} emitida en sustitución de la ${factura.numero}`,
      detalle: verifactuActivo
        ? 'Hacienda tarda alrededor de un minuto en confirmarla.'
        : 'Ya puedes descargarla y enviársela al paciente.',
      factura: data,
      originalId: factura.id,
    })
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={cerrar}
      titulo={`Rectificar la factura ${factura.numero}`}
      descripcion={`${factura.pacienteNombre} · ${euros(factura.importe)}`}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton onClick={enviar} disabled={!valido || trabajando}>
            {trabajando && <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />}
            Emitir la rectificativa
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <p className="rounded-xl bg-crema px-4 py-3 text-sm text-tinta-suave">
          Una factura ya emitida no se modifica
          {verifactuActivo ? ', y menos si se ha enviado a Hacienda' : ''}. Lo que
          se hace es emitir <strong className="text-tinta">otra factura nueva</strong>{' '}
          que la sustituye. La {factura.numero} se quedará en la lista marcada
          como rectificada: no se borra, y eso es lo correcto.
        </p>

        <Campo
          etiqueta="Importe correcto"
          ayuda={`Lo que debería haber puesto. Ahora pone ${euros(factura.importe)}.`}
        >
          <Entrada
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder={String(factura.importe)}
            disabled={trabajando}
          />
        </Campo>

        <Campo
          etiqueta="Motivo de la rectificación"
          ayuda="Esto se envía a Hacienda como la descripción de la factura nueva, así que conviene que se entienda solo."
        >
          <AreaTexto
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por ejemplo: el importe de la sesión era incorrecto"
            maxLength={500}
            disabled={trabajando}
          />
        </Campo>
      </div>
    </Modal>
  )
}
