import { Ban, Check, Clock3 } from 'lucide-react'
import Badge from '../../components/ui/Badge'

/* Pagado (verde) / Pendiente (naranja) / Anulada (gris).
   Si se le pasa `alCambiar`, el badge es un interruptor: un toque marca
   la factura como cobrada. Las anuladas no se cambian desde aquí.

   Hay dos formas de estar anulada y no son lo mismo por dentro, aunque
   se pinten igual: `cancelado` es «esta sesión no se cobra», y
   `anulada` es «la sustituye una rectificativa». */
const ESTADOS = {
  pagado: { tono: 'verde', etiqueta: 'Pagado', icono: Check },
  pendiente: { tono: 'ambar', etiqueta: 'Pendiente', icono: Clock3 },
  cancelado: { tono: 'neutro', etiqueta: 'Anulada', icono: Ban },
  anulada: { tono: 'neutro', etiqueta: 'Rectificada', icono: Ban },
}

export default function EstadoPagoBadge({ estado, alCambiar, tamano = 'md' }) {
  const info = ESTADOS[estado] ?? ESTADOS.pendiente
  const contenido = (
    <Badge tono={info.tono} tamano={tamano} icono={info.icono}>
      {info.etiqueta}
    </Badge>
  )

  if (!alCambiar || estado === 'cancelado' || estado === 'anulada') return contenido

  const pagado = estado === 'pagado'
  return (
    <button
      type="button"
      onClick={alCambiar}
      title={pagado ? 'Marcar como pendiente' : 'Marcar como cobrada'}
      aria-label={`Estado: ${info.etiqueta}. Pulsa para cambiar.`}
      className="rounded-full transition-transform active:scale-95"
    >
      {contenido}
    </button>
  )
}
