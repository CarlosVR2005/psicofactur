import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import { Campo, Entrada, Seleccion } from '../../components/ui/Campo'
import { usePacientes } from '../../hooks/usePacientes'
import { crearFacturaManual } from '../../services/facturas'
import { euros } from '../../lib/formato'

/* Factura que NO sale de una cita: un taller, una formación, un servicio
   suelto a una empresa. Se elige la ficha, el concepto, la base y los
   tipos de IGIC e IRPF, y se ve el desglose antes de crear el borrador.

   Los tipos de IGIC e IRPF que se ofrecen son los habituales; conviene
   que el gestor de la consulta confirme cuáles aplican. */

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

export default function FacturaManualModal({ abierto, alCerrar, alCreada, alFallar }) {
  const { pacientes } = usePacientes()
  const [pacienteId, setPacienteId] = useState('')
  const [concepto, setConcepto] = useState('')
  const [base, setBase] = useState('')
  const [tipoIgic, setTipoIgic] = useState(0)
  const [tipoIrpf, setTipoIrpf] = useState(0)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setPacienteId('')
    setConcepto('')
    setBase('')
    setTipoIgic(0)
    setTipoIrpf(0)
  }, [abierto])

  // Empresas primero: es lo normal para una factura manual
  const ordenados = useMemo(
    () =>
      [...pacientes].sort((a, b) => {
        if ((a.tipoCliente === 'empresa') !== (b.tipoCliente === 'empresa')) {
          return a.tipoCliente === 'empresa' ? -1 : 1
        }
        return a.nombre.localeCompare(b.nombre, 'es')
      }),
    [pacientes],
  )

  const baseNum = Number(base) || 0
  const cuotaIgic = redondeo((baseNum * tipoIgic) / 100)
  const cuotaIrpf = redondeo((baseNum * tipoIrpf) / 100)
  const total = redondeo(baseNum + cuotaIgic)
  const liquido = redondeo(total - cuotaIrpf)

  const valido = pacienteId && concepto.trim() && baseNum > 0

  const cerrar = () => {
    if (!trabajando) alCerrar()
  }

  const crear = async () => {
    if (!valido || trabajando) return
    setTrabajando(true)
    const { data, error } = await crearFacturaManual({
      pacienteId,
      concepto,
      baseImponible: baseNum,
      tipoIgic,
      tipoIrpf,
    })
    setTrabajando(false)
    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }
    alCreada?.({
      tipo: 'exito',
      titulo: `Factura ${data.numero} creada · ${euros(data.total)}`,
      detalle: `${data.pacienteNombre} · ${concepto.trim()}`,
      factura: data,
    })
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={cerrar}
      titulo="Nueva factura"
      descripcion="Para lo que no sale de una cita: talleres, formación, un servicio a una empresa."
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton onClick={crear} disabled={!valido || trabajando}>
            {trabajando && <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />}
            Crear borrador
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="A quién se factura">
          <Seleccion value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}>
            <option value="">Elige una ficha…</option>
            {ordenados.map((p) => (
              <option key={p.id} value={p.id}>
                {p.tipoCliente === 'empresa' && p.empresaRazonSocial
                  ? `${p.empresaRazonSocial} · ${p.nombre}`
                  : p.nombre}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Concepto">
          <Entrada
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Taller de gestión emocional · marzo 2026"
            maxLength={200}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Base imponible (€)">
            <Entrada
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="IGIC">
            <Seleccion
              value={tipoIgic}
              onChange={(e) => setTipoIgic(Number(e.target.value))}
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

        <p className="text-xs text-tinta-tenue">
          Se crea como borrador. Registrarla en Hacienda todavía no está disponible
          para facturas con IGIC o a empresa.
        </p>
      </div>
    </Modal>
  )
}
