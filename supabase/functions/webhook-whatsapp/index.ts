/* ================================================================
   webhook-whatsapp

   Lo que Meta nos cuenta: si el mensaje se entregó, si se leyó, si
   falló, y sobre todo qué botón ha pulsado el paciente.

   SE DESPLIEGA SIN VERIFICACIÓN DE JWT. No hay otra: quien llama es
   Meta, que no sabe nada de sesiones de Supabase. Lo que autentica la
   petición es la firma `X-Hub-Signature-256`, un HMAC del cuerpo con el
   secreto de la app. Sin firma válida no se toca la base.

   La respuesta del paciente NO cambia la cita directamente: se escribe
   en `recordatorios_whatsapp.boton_pulsado` y es el trigger
   `sync_estado_confirmacion` —que ya existía— quien pone la cita en
   confirmada o cancelada. Es exactamente la misma puerta que usa el
   botón de marcar a mano en la pantalla de Recordatorios.
   ================================================================ */

import { clienteAdmin } from '../_shared/supabase.ts'
import { configDeLaConsulta } from '../_shared/recordatorio.ts'
import {
  ESTADO_DE_META,
  ORDEN_ESTADO,
  enviarTexto,
  firmaValida,
  respuestaDelBoton,
  respuestaDePayload,
  verifyToken,
} from '../_shared/whatsapp.ts'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/* --------------------- Estados de envío --------------------- */

async function aplicarEstado(admin: SupabaseClient, estado: any): Promise<void> {
  const nuevo = ESTADO_DE_META[estado?.status]
  if (!nuevo || !estado?.id) return

  const { data: fila } = await admin
    .from('recordatorios_whatsapp')
    .select('id, estado_envio')
    .eq('whatsapp_message_id', estado.id)
    .maybeSingle()

  if (!fila) return

  /* Meta manda los avisos por rachas y no siempre en orden. Sin esta
     comprobación, un «entregado» que llega tarde pisaría un «leído» o,
     peor, un «respondido». */
  if ((ORDEN_ESTADO[nuevo] ?? 0) <= (ORDEN_ESTADO[fila.estado_envio] ?? 0)) return

  const motivo = estado.errors?.[0]
  await admin
    .from('recordatorios_whatsapp')
    .update({
      estado_envio: nuevo,
      error_mensaje: motivo ? (motivo.title ?? motivo.message ?? null) : null,
    })
    .eq('id', fila.id)
}

/* ------------------ Respuesta del paciente ------------------ */

const COLUMNAS_REGISTRO = 'id, psicologa_id, cita_id, boton_pulsado'

/**
 * De qué recordatorio habla el paciente.
 *
 * Dos caminos, y se prueban en este orden:
 *
 *  1. El `context.id`, el id del mensaje al que está contestando: señala
 *     el envío exacto, así que es el que manda cuando viene.
 *  2. El PAYLOAD del botón (`CONFIRMAR_CITA_<id>`), que lleva la cita
 *     dentro. Salva los casos en los que WhatsApp no adjunta el mensaje
 *     citado, que es justo cuando el camino de antes se quedaba ciego.
 */
async function registroDelMensaje(
  admin: SupabaseClient,
  opciones: { citaId: string | null; contextoId: string | null },
): Promise<Record<string, any> | null> {
  if (opciones.contextoId) {
    const { data } = await admin
      .from('recordatorios_whatsapp')
      .select(COLUMNAS_REGISTRO)
      .eq('whatsapp_message_id', opciones.contextoId)
      .maybeSingle()
    if (data) return data
  }

  if (opciones.citaId) {
    // El último recordatorio de esa cita es el que se ha contestado
    const { data } = await admin
      .from('recordatorios_whatsapp')
      .select(COLUMNAS_REGISTRO)
      .eq('cita_id', opciones.citaId)
      .order('enviado_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  return null
}

async function aplicarRespuesta(admin: SupabaseClient, mensaje: any): Promise<void> {
  /* Tres formas de contestar:
       · el botón de la plantilla            -> type 'button'
       · un botón de un mensaje interactivo  -> type 'interactive'
       · escribir «sí» a mano respondiendo   -> type 'text' con contexto */
  const payload = mensaje?.button?.payload ?? mensaje?.interactive?.button_reply?.id ?? null
  const texto =
    mensaje?.button?.text ??
    mensaje?.interactive?.button_reply?.title ??
    (mensaje?.context?.id ? mensaje?.text?.body : null)

  /* El payload lo pusimos nosotros al mandar la plantilla, así que dice
     las dos cosas de una vez: qué ha contestado y de qué cita. Si no
     viene, o viene de otro sitio, se mira el texto como hasta ahora. */
  const porPayload = respuestaDePayload(payload)
  const boton = porPayload?.boton ?? respuestaDelBoton(texto ?? payload)
  if (!boton) return

  const registro = await registroDelMensaje(admin, {
    citaId: porPayload?.citaId ?? null,
    contextoId: mensaje?.context?.id ?? null,
  })

  if (!registro) {
    console.error('[Psicofactur] respuesta de WhatsApp que no casa con ningún recordatorio')
    return
  }
  if (registro.boton_pulsado === boton) return // aviso repetido de Meta

  const { error } = await admin
    .from('recordatorios_whatsapp')
    .update({
      boton_pulsado: boton,
      respondido_at: new Date().toISOString(),
      estado_envio: 'respondido',
    })
    .eq('id', registro.id)

  if (error) {
    console.error('[Psicofactur] no se ha podido guardar la respuesta:', error)
    return
  }

  await acusarRecibo(admin, {
    psicologaId: registro.psicologa_id,
    telefono: mensaje?.from,
    boton,
  })
}

/* --------------------- Acuse de recibo --------------------- */

const ACUSE: Record<string, string> = {
  confirmo: '✅ Tu cita ha quedado confirmada. ¡Gracias y hasta pronto!',
  no_puedo:
    'Anotado, la cita queda anulada. Gracias por avisar. Si quieres cambiarla a otro día, llama a la consulta.',
}

/**
 * Contesta al paciente para que sepa que su respuesta ha llegado.
 *
 * Es un texto suelto y no una plantilla, y se puede porque el paciente
 * acaba de escribirnos: eso abre la ventana de 24 h de Meta. Si falla,
 * se anota en el log y ya está — el estado de la cita ya está guardado,
 * que es lo que de verdad importa.
 */
async function acusarRecibo(
  admin: SupabaseClient,
  opciones: { psicologaId: string; telefono: string | null | undefined; boton: string },
): Promise<void> {
  if (!opciones.telefono) return

  const config = await configDeLaConsulta(admin, opciones.psicologaId)
  if (!config.acuse) return

  const texto = ACUSE[opciones.boton]
  if (!texto) return

  const { error } = await enviarTexto({ telefono: String(opciones.telefono), texto })
  if (error) console.error('[Psicofactur] no se ha podido mandar el acuse:', error)
}

/* ------------------------- Entrada ------------------------- */

Deno.serve(async (req) => {
  const url = new URL(req.url)

  /* Alta del webhook en Meta: contesta al reto con el mismo valor que
     manda, sólo si la frase de verificación coincide. */
  if (req.method === 'GET') {
    const bien =
      Boolean(verifyToken) &&
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === verifyToken

    if (!bien) return new Response('Verificación incorrecta.', { status: 403 })
    return new Response(url.searchParams.get('hub.challenge') ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  if (req.method !== 'POST') return new Response('', { status: 405 })

  // El cuerpo TAL CUAL llegó: la firma se calcula sobre estos bytes
  const crudo = await req.text()
  if (!(await firmaValida(crudo, req.headers.get('x-hub-signature-256')))) {
    console.error('[Psicofactur] webhook de WhatsApp con firma no válida')
    return new Response('Firma no válida.', { status: 401 })
  }

  let datos: any
  try {
    datos = JSON.parse(crudo)
  } catch (_) {
    return new Response('ok', { status: 200 })
  }

  const admin = clienteAdmin()

  try {
    for (const entrada of datos.entry ?? []) {
      for (const cambio of entrada.changes ?? []) {
        const valor = cambio.value ?? {}
        for (const estado of valor.statuses ?? []) await aplicarEstado(admin, estado)
        for (const mensaje of valor.messages ?? []) await aplicarRespuesta(admin, mensaje)
      }
    }
  } catch (e) {
    console.error('[Psicofactur] fallo procesando el webhook:', e)
  }

  /* Siempre 200. Si se devuelve otra cosa, Meta reintenta el mismo
     aviso una y otra vez durante horas; lo que haya fallado está en el
     log, que es donde se mira. */
  return new Response('ok', { status: 200 })
})
