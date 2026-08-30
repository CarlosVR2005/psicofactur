import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, FileWarning, Pencil } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import EstadoPagoBadge from './EstadoPagoBadge'
import MetodoPagoBoton from './MetodoPagoBoton'
import BotonEmitir from './BotonEmitir'
import BotonPDF from './BotonPDF'
import BotonEnviarEmail from './BotonEnviarEmail'
import RectificarModal from './RectificarModal'
import EditarFacturaModal from './EditarFacturaModal'
import TipoCitaBadge from '../agenda/TipoCitaBadge'
import { cambiarEstadoPago } from '../../services/facturas'
import { euros } from '../../lib/formato'
import { fechaNumerica } from '../../lib/fechas'

/* Una factura de la lista: una sesión facturada.
   El badge de estado es pulsable (cobrada / pendiente) y, mientras
   sigue pendiente, se puede anular — las facturas no se borran. */
export default function FacturaFila({
  factura,
  verifactuActivo = false,
  alCambiar,
  alFallar,
  alRectificar,
}) {
  const [trabajando, setTrabajando] = useState(false)
  const [rectificando, setRectificando] = useState(false)
  const [editando, setEditando] = useState(false)

  // 'cancelado' = no se cobra; 'anulada' = la sustituye una rectificativa
  const anulada = factura.estado === 'cancelado' || factura.estado === 'anulada'

  /* Se puede rectificar una factura que ya está cerrada y no anulada.
     Con Veri*Factu hay que esperar además a que Hacienda la acepte; sin
     Veri*Factu basta con que esté emitida, y no se rectifica una que ya
     es rectificativa (para eso se rectifica esa misma). */
  const puedeRectificar = verifactuActivo
    ? factura.verifactuEstado === 'Correcto' && factura.estado !== 'anulada'
    : factura.emitida && !anulada && factura.tipo !== 'rectificativa'

  // Lleva desglose (base / IGIC / IRPF) que merece la pena enseñar
  const conDesglose = factura.tipoIgic > 0 || factura.tipoIrpf > 0

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

  /* Al emitir: con Veri*Factu, la Edge Function devuelve sólo lo que ha
     cambiado y hay que fusionarlo sobre la factura que ya tenemos; en
     local, `emitirFacturaLocal` devuelve la factura entera y basta con
     sustituirla. En los dos casos la lista se entera al momento. */
  const apuntarEmision = (aviso) => {
    alFallar?.(aviso) // el mismo canal de avisos, esta vez para bien
    if (!verifactuActivo) {
      alCambiar?.(aviso.factura ?? { ...factura, emitida: true })
      return
    }
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
          {factura.esManual ? (
            <>
              <span className="text-tinta-tenue">·</span>
              <span className="truncate">{factura.concepto}</span>
            </>
          ) : factura.fechaSesion ? (
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
          {factura.esEmpresa && (
            <Badge tono="azul" tamano="sm">
              Empresa
            </Badge>
          )}
          {factura.tipoSesion && <TipoCitaBadge tipo={factura.tipoSesion} />}
        </p>
      </div>

      <div
        className={`ml-auto text-right ${anulada ? 'line-through' : ''}`}
      >
        <p className="font-semibold tabular-nums text-tinta">{euros(factura.importe)}</p>
        {conDesglose && (
          <p className="text-xs text-tinta-tenue tabular-nums">
            base {euros(factura.base)}
            {factura.tipoIgic > 0 && ` · IGIC ${factura.tipoIgic}%`}
            {factura.tipoIrpf > 0 && ` · −IRPF ${factura.tipoIrpf}%`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {/* Editar sólo mientras es borrador: en cuanto sale hacia
            Hacienda lo que queda es rectificarla. */}
        {!factura.emitida && !anulada && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            disabled={trabajando}
            title="Editar la factura antes de emitirla"
            aria-label="Editar la factura"
            className="rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-marca-50 hover:text-marca-700"
          >
            <Pencil className="size-4" strokeWidth={2} />
          </button>
        )}

        <BotonEmitir
          factura={factura}
          verifactuActivo={verifactuActivo}
          alEmitir={apuntarEmision}
          alFallar={alFallar}
        />

        <BotonPDF
          factura={factura}
          verifactuActivo={verifactuActivo}
          alFallar={alFallar}
        />

        <BotonEnviarEmail
          factura={factura}
          verifactuActivo={verifactuActivo}
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

        <MetodoPagoBoton
          factura={factura}
          alCambiar={alCambiar}
          alFallar={alFallar}
          disabled={anulada || trabajando}
        />

        {/* Rectificar: cuando la factura ya está cerrada (y aceptada por
            Hacienda si Veri*Factu está activo) y no está ya rectificada.
            Antes no hay nada que sustituir; después la que vale es la
            rectificativa. */}
        {puedeRectificar && (
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
        verifactuActivo={verifactuActivo}
        abierto={rectificando}
        alCerrar={() => setRectificando(false)}
        alRectificar={(aviso) => {
          setRectificando(false)
          alRectificar?.(aviso)
        }}
        alFallar={alFallar}
      />

      <EditarFacturaModal
        factura={factura}
        abierto={editando}
        alCerrar={() => setEditando(false)}
        alGuardar={(aviso) => {
          setEditando(false)
          alFallar?.(aviso) // el mismo canal de avisos, esta vez para bien
          alCambiar?.(aviso.factura)
        }}
        alFallar={alFallar}
      />
    </div>
  )
}
