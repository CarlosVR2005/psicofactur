import Badge from '../../components/ui/Badge'

/* Estado "vivo" de la cita.
   Los tres estados salen del enum `estado_confirmacion` de la base;
   «Sin enviar» no es un estado de la base, es que esa cita todavía no
   tiene ningún recordatorio en `recordatorios_whatsapp`.

   El punto que late en «Pendiente» es la pista visual de que la app
   está esperando una respuesta que puede llegar en cualquier momento:
   cuando el paciente pulse el botón en WhatsApp, esto cambiará solo. */
const ESTADOS = {
  confirmada: { tono: 'verde', etiqueta: 'Confirmada', vivo: false },
  pendiente: { tono: 'ambar', etiqueta: 'Pendiente de respuesta', vivo: true },
  cancelada: { tono: 'rojo', etiqueta: 'Cancelada', vivo: false },
}

const SIN_ENVIAR = { tono: 'neutro', etiqueta: 'Sin enviar', vivo: false }

export default function EstadoConfirmacionBadge({
  estado,
  enviado = true,
  tamano = 'md',
}) {
  // Si aún no se ha mandado el recordatorio, «pendiente» todavía no
  // significa nada: nadie ha preguntado al paciente.
  const info =
    !enviado && estado === 'pendiente' ? SIN_ENVIAR : (ESTADOS[estado] ?? SIN_ENVIAR)

  return (
    <Badge tono={info.tono} tamano={tamano} punto vivo={info.vivo}>
      {info.etiqueta}
    </Badge>
  )
}

export { ESTADOS as ESTADOS_CONFIRMACION }
