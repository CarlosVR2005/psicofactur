/* ================================================================
   EL RECORDATORIO DE UNA CITA

   Componer el mensaje, mandarlo y dejar constancia. Lo usan los dos
   caminos que existen:

   · `enviar-recordatorio-whatsapp`   → ella pulsa Enviar en la pantalla
   · `enviar-recordatorios-automaticos` → el cron, 24 h antes

   Están aquí juntos a propósito: son el mismo mensaje y el mismo
   histórico, y si mañana cambia el texto tiene que cambiar en los dos a
   la vez.

   PRIVACIDAD: al mensaje sólo van el nombre de pila, la fecha y la
   hora. Ni el tipo de sesión, ni las notas, ni nada clínico — es un
   mensaje que pasa por los servidores de Meta.
   ================================================================ */

import { enviarPlantilla, normalizarTelefono } from './whatsapp.ts'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/* La consulta está en Madrid; el servidor, en UTC. La fecha del mensaje
   se compone siempre en la zona de la consulta. */
export const ZONA = 'Europe/Madrid'

/** Lo que hace falta de la cita para poder mandar el recordatorio. */
export const COLUMNAS_CITA = `
  id, fecha_hora,
  paciente:pacientes!citas_paciente_id_fkey (nombre, telefono)
`

export interface CitaParaRecordatorio {
  id: string
  fecha_hora: string
  paciente?: { nombre: string | null; telefono: string | null } | null
}

export interface ConfigWhatsApp {
  activo: boolean
  plantilla: string
  idioma: string
  horasAntes: number
  acuse: boolean
}

const POR_DEFECTO: ConfigWhatsApp = {
  activo: false,
  plantilla: 'recordatorio_cita',
  idioma: 'es',
  horasAntes: 24,
  acuse: true,
}

/**
 * Preferencias de la consulta, con los valores por defecto puestos.
 * Aquí no hay ningún secreto: el token de Meta no está en la base.
 */
export async function configDeLaConsulta(
  cliente: SupabaseClient,
  psicologaId: string,
): Promise<ConfigWhatsApp> {
  const { data } = await cliente
    .from('psicologas')
    .select('whatsapp_config')
    .eq('id', psicologaId)
    .maybeSingle()

  const guardada = (data?.whatsapp_config ?? {}) as Partial<ConfigWhatsApp>
  const horas = Number(guardada.horasAntes)

  return {
    ...POR_DEFECTO,
    ...guardada,
    // Viene de un JSONB que se edita a mano: no fiarse del tipo
    horasAntes: Number.isFinite(horas) && horas > 0 && horas <= 168 ? horas : POR_DEFECTO.horasAntes,
  }
}

/* ---------------------- El texto ---------------------- */

/** Los tres huecos de la plantilla: nombre de pila, día y hora. */
export function huecosDeLaPlantilla(cita: CitaParaRecordatorio): string[] {
  const cuando = new Date(cita.fecha_hora)
  const nombreCorto = String(cita.paciente?.nombre ?? '').split(' ')[0] || 'Hola'

  const dia = new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(cuando)

  const hora = new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
  }).format(cuando)

  return [nombreCorto, dia, hora]
}

/* ---------------------- El envío ---------------------- */

export interface ResultadoRecordatorio {
  enviado: boolean
  aviso: string | null
  registro: Record<string, unknown> | null
  /** Ya había un recordatorio automático para esta cita: no se manda otro. */
  duplicado?: boolean
}

/**
 * Manda el recordatorio de una cita y lo anota en el histórico.
 *
 * El orden importa: **primero se apunta la fila y después se manda**.
 * Es al revés de lo que parece natural, y es a propósito — el índice
 * único `recordatorios_whatsapp_auto_unica` sólo deja una fila
 * automática por cita, así que apuntar primero convierte ese índice en
 * el cerrojo que impide mandar el mismo recordatorio dos veces si dos
 * vueltas del cron se solapan. Al revés, el cerrojo llegaría tarde: el
 * paciente ya tendría dos mensajes.
 *
 * Lo que se paga por ese orden: si la función se cayera justo entre el
 * apunte y la llamada a Meta, quedaría una fila «enviado» sin
 * `whatsapp_message_id` de un mensaje que no salió. Se reconocen así, y
 * son mucho más raras que dos vueltas del cron pisándose.
 *
 * @param cliente el de ella (con RLS) desde la pantalla, el de servicio
 *                desde el cron. Nunca uno de servicio con un id que
 *                venga del navegador sin comprobar.
 */
export async function enviarRecordatorio(
  cliente: SupabaseClient,
  opciones: {
    psicologaId: string
    cita: CitaParaRecordatorio
    config: ConfigWhatsApp
    origen: 'manual' | 'automatico'
  },
): Promise<ResultadoRecordatorio> {
  const { psicologaId, cita, config, origen } = opciones

  const telefono = normalizarTelefono(cita.paciente?.telefono)
  if (!telefono) {
    return {
      enviado: false,
      aviso: 'El teléfono de la ficha del paciente no es válido. Revísalo y vuelve a intentarlo.',
      registro: null,
    }
  }

  // 1) Apuntar el intento (y coger el cerrojo, si es automático)
  const { data: registro, error: errorRegistro } = await cliente
    .from('recordatorios_whatsapp')
    .insert({
      psicologa_id: psicologaId,
      cita_id: cita.id,
      origen,
      estado_envio: 'enviado',
    })
    .select('id, enviado_at, estado_envio, origen')
    .single()

  if (errorRegistro) {
    // 23505: ya hay una fila automática para esta cita. Otra vuelta del
    // cron se ha adelantado; que no salgan dos mensajes.
    if (errorRegistro.code === '23505') {
      return { enviado: false, aviso: null, registro: null, duplicado: true }
    }
    console.error('[Psicofactur] no se ha podido anotar el envío:', errorRegistro)
    return { enviado: false, aviso: 'No se ha podido anotar el envío.', registro: null }
  }

  // 2) Mandarlo
  const { messageId, error } = await enviarPlantilla({
    telefono,
    plantilla: config.plantilla,
    idioma: config.idioma,
    parametros: huecosDeLaPlantilla(cita),
    citaId: cita.id,
  })

  /* 3) Cerrar la fila. Un envío fallido también queda anotado: si no
     dejara rastro sería un paciente al que nadie ha avisado y nadie
     sabe que nadie ha avisado. */
  const { data: cerrada, error: errorCierre } = await cliente
    .from('recordatorios_whatsapp')
    .update({
      estado_envio: error ? 'fallido' : 'enviado',
      whatsapp_message_id: messageId,
      error_mensaje: error,
    })
    .eq('id', registro.id)
    .select('id, enviado_at, estado_envio, origen')
    .single()

  if (errorCierre) {
    console.error('[Psicofactur] no se ha podido cerrar el envío:', errorCierre)
  }

  return { enviado: !error, aviso: error, registro: cerrada ?? registro }
}
