import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import Avatar from '../../components/ui/Avatar'
import AvisoError from '../../components/ui/AvisoError'
import Cargando from '../../components/ui/Cargando'
import TipoCitaBadge from '../agenda/TipoCitaBadge'
import BotonFacturar from './BotonFacturar'
import { euros } from '../../lib/formato'
import { fechaNumerica } from '../../lib/fechas'

/* Todas las sesiones dadas que aún no tienen factura, de la más antigua
   a la más reciente. Cada una se factura con un toque. */
export default function SesionesSinFacturarModal({
  abierto,
  alCerrar,
  sesiones,
  cargando,
  error,
  alFacturar,
}) {
  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Sesiones sin facturar"
      descripcion={
        cargando
          ? 'Buscando…'
          : sesiones.length === 0
            ? 'No queda ninguna pendiente.'
            : `${sesiones.length} ${sesiones.length === 1 ? 'sesión pendiente' : 'sesiones pendientes'} de facturar.`
      }
      pie={
        <Boton variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      }
    >
      <AvisoError error={error} className="mb-4" />

      {cargando ? (
        <Cargando texto="Buscando sesiones…" />
      ) : sesiones.length === 0 ? (
        <p className="py-8 text-center text-tinta-suave">
          Todas las sesiones celebradas están facturadas. 🎉
        </p>
      ) : (
        <ul className="divide-y divide-borde">
          {sesiones.map((s) => (
            <li key={s.citaId} className="flex items-center gap-3 py-3 first:pt-0">
              <Avatar nombre={s.pacienteNombre} tamano="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-tinta">{s.pacienteNombre}</p>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-tinta-suave">
                  {fechaNumerica(s.fecha)} · {s.hora}
                  <TipoCitaBadge tipo={s.tipo} />
                </p>
              </div>
              <span className="font-medium tabular-nums text-tinta">
                {euros(s.precioSesion)}
              </span>
              {/* Se le pasa sólo esta sesión: el botón factura la primera */}
              <BotonFacturar sesiones={[s]} alFacturar={alFacturar} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
