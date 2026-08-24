import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, FileWarning } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import EstadoPagoBadge from './EstadoPagoBadge'
import BotonEmitir from './BotonEmitir'
import BotonPDF from './BotonPDF'
import BotonEnviarEmail from './BotonEnviarEmail'
import RectificarModal from './RectificarModal'
import TipoCitaBadge from '../agenda/TipoCitaBadge'
import { cambiarEstadoPago } from '../../services/facturas'
import { euros } from '../../lib/formato'
import { fechaNumerica } from '../../lib/fechas'

/* Una factura de la lista: una sesión facturada.
   El badge de estado es pulsable (cobrada / pendiente) y, mientras
   sigue pendiente, se puede anular — las facturas no se borran. */
export default function FacturaFila({ factura, alCambiar, alFallar, alRectificar }) {
  const [trabajando, setTrabajando] = useState(false)
  const [rectificando, setRectificando] = useState(false)

  // 'cancelado' = no se cobra; 'anulada' = la sustituye una rectificativa
  const anulada = factura.estado === 'cancelado' || factura.estado === 'anulada'

  const cambiar = async (estado) => {
    setTrabajando(true)
    const { data, error } = await cambiarEstadoPago(factura.id, estado)
    setTrabajando(false)
    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }
    alCambiar?.(data)
  }

  /* Al emitir, la Edge Function devuelve sólo lo que ha cambiado, no la
     factura entera. Se fusiona sobre la que ya tenemos y la lista se
     entera al momento, sin volver a consultar. */
  const apuntarEmision = (aviso) => {
    alFallar?.(aviso) // el mismo canal de avisos, esta vez para bien
    alCambiar?.({
      ...factura,
      emitida: true,
      verifactuId: aviso.factura?.verifactuId ?? factura.verifactuId,
      verifactuEstado: aviso.factura?.estado ?? 'Pendiente',
      qrUrl: aviso.factura?.qrUrl ?? factura.qrUrl,
      huella: aviso.factura?.huella ?? factura.huella,
    })
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-crema/60 sm:px-5 ${
        trabajando ? 'opacity-60' : ''
      } ${anulada ? 'opacity-70' : ''}`}
    >
      <Avatar nombre={factura.pacienteNombre} tamano="sm" />

      <div className="min-w-0 flex-1">
        <Link
          to={`/pacientes/${factura.pacienteId}`}
          className="truncate font-medium text-tinta hover:text-marca-600 hover:underline"
        >
          {factura.pacienteNombre}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-sm text-tinta-suave">
          <span className="font-medium tabular-nums">{factura.numero}</span>
          {factura.fechaSesion ? (
            <>
              <span className="text-tinta-tenue">·</span>
              <span>
                sesión del {fechaNumerica(factura.fechaSesion)} a las{' '}
                {factura.horaSesion}
              </span>
            </>
          ) : (
            <>
              <span className="text-tinta-tenue">·</span>
              <span>emitida el {fechaNumerica(factura.fechaEmision)}</span>
            </>
          )}
          {factura.tipoSesion && <TipoCitaBadge tipo={factura.tipoSesion} />}
        </p>
      </div>

      <p
        className={`ml-auto text-right font-semibold tabular-nums text-tinta ${
          anulada ? 'line-through' : ''
        }`}
      >
        {euros(factura.importe)}
      </p>

      <div className="flex items-center gap-1.5">
        <BotonEmitir factura={factura} alEmitir={apuntarEmision} alFallar={alFallar} />

        <BotonPDF factura={factura} alFallar={alFallar} />

        <BotonEnviarEmail
          factura={factura}
          alCambiar={alCambiar}
          alFallar={alFallar}
        />

        <EstadoPagoBadge
          estado={factura.estado}
          alCambiar={
            trabajando
              ? undefined
              : () => cambiar(factura.estado === 'pagado' ? 'pendiente' : 'pagado')
          }
        />
        {/* Rectificar sólo se ofrece si Hacienda la aceptó y no está ya
            rectificada. Antes de eso no hay nada que sustituir, y
            después la que vale es la rectificativa. */}
        {factura.verifactuEstado === 'Correcto' && factura.estado !== 'anulada' && (
          <button
            type="button"
            onClick={() => setRectificando(true)}
            disabled={trabajando}
            title="Emitir una factura nueva que sustituya a ésta"
            aria-label="Rectificar la factura"
            className="rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-ambar-suave hover:text-ambar"
          >
            <FileWarning className="size-4" strokeWidth={2} />
          </button>
        )}

        {/* Una vez registrada en Hacienda ya no se anula desde aquí: eso
            dejaría la app diciendo una cosa y la AEAT otra. Para esas se
            emite una rectificativa. */}
        {factura.estado === 'pendiente' && !factura.emitida && (
          <button
            type="button"
            onClick={() => cambiar('cancelado')}
            disabled={trabajando}
            title="Anular la factura (no se borra, queda anulada)"
            aria-label="Anular la factura"
            className="rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-rojo-suave hover:text-rojo"
          >
            <Ban className="size-4" strokeWidth={2} />
          </button>
        )}
      </div>

      <RectificarModal
        factura={factura}
        abierto={rectificando}
        alCerrar={() => setRectificando(false)}
        alRectificar={(aviso) => {
          setRectificando(false)
          alRectificar?.(aviso)
        }}
        alFallar={alFallar}
      />
    </div>
  )
}
