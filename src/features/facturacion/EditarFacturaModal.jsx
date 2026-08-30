import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import { Campo, Entrada, Seleccion } from '../../components/ui/Campo'
import { editarBorradorFactura } from '../../services/facturas'
import { euros } from '../../lib/formato'

/* Retocar una factura mientras todavía es un borrador. Una vez
   registrada en Hacienda ya no se edita: habría que rectificarla.

   Dos formas:
    · Sesión a un particular → sólo el importe.
    · Empresa o factura manual → base + tipos de IGIC e IRPF, con el
      desglose recalculado en vivo. */

const IGIC = [
  { valor: 0, etiqueta: 'Exento (0%)' },
  { valor: 3, etiqueta: 'IGIC 3%' },
  { valor: 7, etiqueta: 'IGIC 7%' },
]
const IRPF = [
  { valor: 0, etiqueta: 'Sin retención' },
  { valor: 7, etiqueta: 'IRPF 7%' },
  { valor: 15, etiqueta: 'IRPF 15%' },
]

const redondeo = (n) => Math.round(Number(n || 0) * 100) / 100

export default function EditarFacturaModal({ factura, abierto, alCerrar, alGuardar, alFallar }) {
  const conDesglose = Boolean(factura?.esEmpresa || factura?.esManual)

  const [importe, setImporte] = useState('')
  const [base, setBase] = useState('')
  const [tipoIgic, setTipoIgic] = useState(0)
  const [tipoIrpf, setTipoIrpf] = useState(0)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    if (!abierto || !factura) return
    setImporte(String(factura.importe ?? ''))
    setBase(String(factura.base ?? factura.importe ?? ''))
    setTipoIgic(Number(factura.tipoIgic ?? 0))
    setTipoIrpf(Number(factura.tipoIrpf ?? 0))
  }, [abierto, factura])

  if (!factura) return null

  const importeNum = Number(importe)
  const baseNum = Number(base) || 0
  const cuotaIgic = redondeo((baseNum * tipoIgic) / 100)
  const cuotaIrpf = redondeo((baseNum * tipoIrpf) / 100)
  const total = redondeo(baseNum + cuotaIgic)
  const liquido = redondeo(total - cuotaIrpf)

  const valido = conDesglose ? baseNum > 0 : importe !== '' && importeNum > 0
  const sinCambios = conDesglose
    ? baseNum === Number(factura.base ?? factura.importe) &&
      tipoIgic === Number(factura.tipoIgic ?? 0) &&
      tipoIrpf === Number(factura.tipoIrpf ?? 0)
    : importeNum === Number(factura.importe)

  const cerrar = () => {
    if (!trabajando) alCerrar()
  }

  const guardar = async () => {
    if (!valido || sinCambios || trabajando) return
    setTrabajando(true)
    const { data, error } = await editarBorradorFactura(
      factura.id,
      conDesglose ? { base: baseNum, tipoIgic, tipoIrpf } : { importe: importeNum },
    )
    setTrabajando(false)
    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }
    alGuardar?.({
      tipo: 'exito',
      titulo: `Factura ${data.numero} actualizada`,
      detalle: conDesglose ? `Líquido: ${euros(data.importe)}` : `Nuevo importe: ${euros(data.importe)}`,
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

        {conDesglose ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="Base imponible (€)">
                <Entrada
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  disabled={trabajando}
                  autoFocus
                />
              </Campo>
              <Campo etiqueta="IGIC">
                <Seleccion
                  value={tipoIgic}
                  onChange={(e) => setTipoIgic(Number(e.target.value))}
                  disabled={trabajando}
                >
                  {IGIC.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              <Campo etiqueta="Retención IRPF">
                <Seleccion
                  value={tipoIrpf}
                  onChange={(e) => setTipoIrpf(Number(e.target.value))}
                  disabled={trabajando}
                >
                  {IRPF.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
            </div>

            <dl className="space-y-1.5 rounded-xl bg-crema px-4 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-tinta-suave">Base</dt>
                <dd className="tabular-nums">{euros(baseNum)}</dd>
              </div>
              {tipoIgic > 0 && (
                <div className="flex justify-between">
                  <dt className="text-tinta-suave">IGIC {tipoIgic}%</dt>
                  <dd className="tabular-nums">+{euros(cuotaIgic)}</dd>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <dt>Total factura</dt>
                <dd className="tabular-nums">{euros(total)}</dd>
              </div>
              {tipoIrpf > 0 && (
                <>
                  <div className="flex justify-between text-tinta-suave">
                    <dt>Retención IRPF {tipoIrpf}%</dt>
                    <dd className="tabular-nums">−{euros(cuotaIrpf)}</dd>
                  </div>
                  <div className="flex justify-between font-medium text-verde">
                    <dt>Líquido a percibir</dt>
                    <dd className="tabular-nums">{euros(liquido)}</dd>
                  </div>
                </>
              )}
            </dl>
          </>
        ) : (
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
        )}
      </div>
    </Modal>
  )
}
