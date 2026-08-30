import Badge from '../../components/ui/Badge'
import { TIPOS_CITA } from '../../lib/tipos'

/* Individual · Pareja · Online — cada uno con su color, siempre el mismo
   en la agenda, en la ficha del paciente y en el panel de recordatorios. */
const TONO = {
  individual: 'sesionInd',
  pareja: 'sesionPar',
  online: 'sesionOnl',
}

export default function TipoCitaBadge({ tipo, tamano = 'sm' }) {
  const info = TIPOS_CITA[tipo]
  if (!info) return null
  return (
    <Badge tono={TONO[tipo]} tamano={tamano} punto>
      {info.etiqueta}
    </Badge>
  )
}

/** Leyenda de colores para la cabecera del calendario */
export function LeyendaTipos({ className = '', conCancelada = false }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>
      {Object.values(TIPOS_CITA).map((t) => (
        <span
          key={t.id}
          className="flex items-center gap-2 text-sm text-tinta-suave"
        >
          <span className={`size-2.5 rounded-full ${t.punto}`} />
          {t.etiqueta}
        </span>
      ))}
      {conCancelada && (
        <span className="flex items-center gap-2 text-sm text-tinta-tenue">
          <span className="size-2.5 rounded-full bg-transparent ring-1 ring-inset ring-rojo/60" />
          <span className="line-through">Cancelada</span>
        </span>
      )}
    </div>
  )
}

/* Leyenda del mes: ahí el punto es la confirmación del paciente, no el
   tipo de sesión. */
const CONFIRMACION_LEYENDA = [
  { clase: 'bg-verde', texto: 'Confirmada' },
  { clase: 'bg-ambar', texto: 'Sin confirmar' },
  { clase: 'bg-transparent ring-1 ring-inset ring-rojo/60', texto: 'Cancelada' },
]

export function LeyendaConfirmacion({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>
      {CONFIRMACION_LEYENDA.map((c) => (
        <span key={c.texto} className="flex items-center gap-2 text-sm text-tinta-suave">
          <span className={`size-2.5 rounded-full ${c.clase}`} />
          {c.texto}
        </span>
      ))}
    </div>
  )
}
