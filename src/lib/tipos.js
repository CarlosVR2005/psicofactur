/* Tipos y estados que vienen de los ENUM de la base de datos.
   Un único sitio donde vive el color y el nombre de cada uno: badges,
   calendario, leyenda y formularios beben todos de aquí.

   Deben coincidir con los enum de Postgres:
     tipo_cita            = individual | pareja | online
     estado_confirmacion  = pendiente | confirmada | cancelada
     estado_envio_whatsapp= enviado | entregado | leido | respondido | fallido
*/

export const TIPOS_CITA = {
  individual: {
    id: 'individual',
    // Lo que se imprime como concepto en la factura del paciente. OJO:
    // tiene que decir lo mismo que ETIQUETA_TIPO de la Edge Function
    // `generar-factura`, que es lo que se le manda a la AEAT.
    descripcionFactura: 'Sesión de psicoterapia individual',
    etiqueta: 'Individual',
    duracion: 55,
    punto: 'bg-marca-500',
    chip: 'bg-marca-50 text-marca-700 border-marca-200',
    barra: 'bg-marca-500',
  },
  pareja: {
    id: 'pareja',
    // Lo que se imprime como concepto en la factura del paciente. OJO:
    // tiene que decir lo mismo que ETIQUETA_TIPO de la Edge Function
    // `generar-factura`, que es lo que se le manda a la AEAT.
    descripcionFactura: 'Sesión de terapia de pareja',
    etiqueta: 'Pareja',
    duracion: 75,
    punto: 'bg-malva',
    chip: 'bg-malva-suave text-malva border-malva/25',
    barra: 'bg-malva',
  },
  online: {
    id: 'online',
    // Lo que se imprime como concepto en la factura del paciente. OJO:
    // tiene que decir lo mismo que ETIQUETA_TIPO de la Edge Function
    // `generar-factura`, que es lo que se le manda a la AEAT.
    descripcionFactura: 'Sesión de psicoterapia online',
    etiqueta: 'Online',
    duracion: 55,
    punto: 'bg-azul',
    chip: 'bg-azul-suave text-azul border-azul/25',
    barra: 'bg-azul',
  },
}

export const LISTA_TIPOS = Object.values(TIPOS_CITA)

/** Cómo se ve el envío del recordatorio (columna estado_envio) */
export const ESTADOS_ENVIO = {
  enviado: 'Enviado',
  entregado: 'Entregado',
  leido: 'Leído',
  respondido: 'Respondido',
  fallido: 'No se pudo enviar',
}

/* Valores que el webhook de WhatsApp escribirá en `boton_pulsado` y que
   el trigger `sync_estado_confirmacion` traduce a estado de la cita. */
export const BOTON_WHATSAPP = {
  confirmar: 'confirmo',
  cancelar: 'no_puedo',
}
