import { Check, Clock3, FileSignature } from 'lucide-react'
import Badge from '../../components/ui/Badge'

/* El estado del consentimiento, en un solo vistazo.

   `NO_ENVIADO` no pinta nada por defecto: en una consulta con mil
   fichas heredadas, la inmensa mayoría están sin enviar y un badge gris
   en cada línea del listado sería ruido puro. En la ficha, donde sí hay
   sitio y sí importa, se pide con `mostrarSinEnviar`. */
const ESTADOS = {
  NO_ENVIADO: {
    tono: 'neutro',
    etiqueta: 'Sin enviar',
    icono: FileSignature,
  },
  PENDIENTE: {
    tono: 'ambar',
    etiqueta: 'Esperando respuesta',
    icono: Clock3,
  },
  FIRMADO: {
    tono: 'verde',
    etiqueta: 'Firmado',
    icono: Check,
  },
}

export default function ConsentimientoBadge({
  estado,
  tamano = 'md',
  mostrarSinEnviar = true,
  etiqueta,
}) {
  const info = ESTADOS[estado] ?? ESTADOS.NO_ENVIADO

  if (estado === 'NO_ENVIADO' && !mostrarSinEnviar) return null

  return (
    <Badge tono={info.tono} tamano={tamano} icono={info.icono}>
      {etiqueta ?? info.etiqueta}
    </Badge>
  )
}

export { ESTADOS as ESTADOS_CONSENTIMIENTO }
