/* ================================================================
   WHATSAPP BUSINESS (Meta Cloud API)

   Todo lo que habla con Meta vive aquí.

   A diferencia de Google, aquí no hay OAuth ni refresh tokens: Meta da
   un token permanente de usuario de sistema. Va como secreto de las
   Edge Functions, nunca por el navegador ni en una tabla.

   Secretos que hay que poner en Supabase → Edge Functions → Secrets:
     WHATSAPP_TOKEN            token permanente del usuario de sistema
     WHATSAPP_PHONE_NUMBER_ID  id del número (no el número: el id)
     WHATSAPP_VERIFY_TOKEN     una frase inventada, la misma que se pone
                               en Meta al dar de alta el webhook
     WHATSAPP_APP_SECRET       secreto de la app, para validar la firma
     WHATSAPP_API_VERSION      opcional, p.ej. v21.0
   ================================================================ */

const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? ''
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? ''
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''

/* Meta retira las versiones viejas de la API cada cierto tiempo. Se deja
   configurable para poder subirla sin tocar el código. */
const VERSION = Deno.env.get('WHATSAPP_API_VERSION') || 'v21.0'

export const verifyToken = VERIFY_TOKEN

export function whatsappConfigurado(): boolean {
  return Boolean(TOKEN && PHONE_NUMBER_ID)
}

/** Falta algo por configurar: lo dice en cristiano para la pantalla. */
export function queFaltaPorConfigurar(): string[] {
  const falta: string[] = []
  if (!TOKEN) falta.push('WHATSAPP_TOKEN')
  if (!PHONE_NUMBER_ID) falta.push('WHATSAPP_PHONE_NUMBER_ID')
  if (!VERIFY_TOKEN) falta.push('WHATSAPP_VERIFY_TOKEN')
  if (!APP_SECRET) falta.push('WHATSAPP_APP_SECRET')
  return falta
}

/* ---------------------- Botones ---------------------- */

/* Lo que viaja dentro de cada botón de la plantilla. Es la forma FIABLE
   de saber de qué cita habla el paciente: el `context.id` del mensaje
   sólo llega cuando WhatsApp adjunta la cita al responder, y hay
   clientes viejos que no lo mandan. Con el payload, la respuesta se
   identifica sola aunque no venga contexto ninguno.

   OJO al orden: el índice del botón tiene que coincidir con el de la
   plantilla aprobada en Meta —el primero «Sí, confirmo», el segundo «No
   puedo»—. Si algún día se reordenan allí, hay que reordenarlos aquí.
   El texto se sigue mirando como plan B (ver `respuestaDelBoton`), así
   que un desajuste no pierde la respuesta: sólo la deja sin cita. */
export const PREFIJO_CONFIRMAR = 'CONFIRMAR_CITA_'
export const PREFIJO_CANCELAR = 'CANCELAR_CITA_'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RespuestaConCita {
  boton: 'confirmo' | 'no_puedo'
  citaId: string
}

/**
 * Lee el payload del botón pulsado: qué contestó y a qué cita.
 * @returns null si no es uno de nuestros payloads
 */
export function respuestaDePayload(payload: string | null | undefined): RespuestaConCita | null {
  const bruto = String(payload ?? '').trim()
  if (!bruto) return null

  const enMayusculas = bruto.toUpperCase()
  let boton: 'confirmo' | 'no_puedo'
  let citaId: string

  if (enMayusculas.startsWith(PREFIJO_CONFIRMAR)) {
    boton = 'confirmo'
    citaId = bruto.slice(PREFIJO_CONFIRMAR.length)
  } else if (enMayusculas.startsWith(PREFIJO_CANCELAR)) {
    boton = 'no_puedo'
    citaId = bruto.slice(PREFIJO_CANCELAR.length)
  } else {
    return null
  }

  /* El payload llega de fuera: si no es un uuid, no se usa para buscar
     nada en la base. */
  return UUID.test(citaId) ? { boton, citaId } : null
}

/* ---------------------- Teléfonos ---------------------- */

/**
 * El teléfono tal y como lo quiere Meta: sólo dígitos, con prefijo de
 * país y sin el «+». Las fichas están rellenadas a mano, así que llegan
 * con espacios, guiones y unas veces con +34 y otras sin él.
 *
 * @returns null si no parece un móvil español válido
 */
export function normalizarTelefono(bruto: string | null | undefined): string | null {
  const digitos = String(bruto ?? '').replace(/\D/g, '')
  if (!digitos) return null

  // 0034... -> 34...
  const sinCeros = digitos.replace(/^00/, '')

  if (sinCeros.startsWith('34')) {
    return sinCeros.length === 11 ? sinCeros : null
  }
  // Nueve dígitos y empieza por 6, 7 (móvil) o 8, 9 (fijo)
  if (sinCeros.length === 9) return `34${sinCeros}`

  // Otro país ya escrito con su prefijo
  return sinCeros.length >= 10 && sinCeros.length <= 15 ? sinCeros : null
}

/* ---------------------- Enviar ---------------------- */

export interface ResultadoEnvio {
  messageId: string | null
  error: string | null
}

/**
 * Manda una plantilla aprobada.
 *
 * Tiene que ser una plantilla: Meta no deja escribir texto libre a
 * alguien que no te ha escrito en las últimas 24 horas, y un
 * recordatorio es justo eso.
 */
export async function enviarPlantilla(opciones: {
  telefono: string
  plantilla: string
  idioma: string
  parametros: string[]
  /* Si viene, los botones salen con el id de la cita dentro. */
  citaId?: string
}): Promise<ResultadoEnvio> {
  const componentes: unknown[] = [
    {
      type: 'body',
      parameters: opciones.parametros.map((texto) => ({ type: 'text', text: texto })),
    },
  ]

  if (opciones.citaId) {
    componentes.push(
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '0',
        parameters: [{ type: 'payload', payload: `${PREFIJO_CONFIRMAR}${opciones.citaId}` }],
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '1',
        parameters: [{ type: 'payload', payload: `${PREFIJO_CANCELAR}${opciones.citaId}` }],
      },
    )
  }

  return await llamarAMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: opciones.telefono,
    type: 'template',
    template: {
      name: opciones.plantilla,
      language: { code: opciones.idioma },
      components: componentes,
    },
  })
}

/**
 * Un mensaje de texto suelto.
 *
 * Sólo vale para contestar a alguien que nos ha escrito hace menos de 24
 * horas: es justo el caso del acuse («✅ Queda confirmada»), que sale a
 * los segundos de que el paciente pulse el botón. Fuera de esa ventana
 * Meta lo rechaza con el código 131047 y hace falta plantilla.
 */
export async function enviarTexto(opciones: {
  telefono: string
  texto: string
}): Promise<ResultadoEnvio> {
  return await llamarAMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: opciones.telefono,
    type: 'text',
    text: { preview_url: false, body: opciones.texto },
  })
}

/** El único sitio que habla con Graph API: un fallo se ve en un solo sitio. */
async function llamarAMeta(cuerpo: unknown): Promise<ResultadoEnvio> {
  const url = `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
    })
    const datos = await r.json().catch(() => null)

    if (!r.ok) {
      console.error('[Psicofactur] WhatsApp rechazó el envío:', r.status, datos)
      return { messageId: null, error: mensajeDeMeta(datos) }
    }
    return { messageId: datos?.messages?.[0]?.id ?? null, error: null }
  } catch (e) {
    console.error('[Psicofactur] no se ha podido llamar a WhatsApp:', e)
    return { messageId: null, error: 'No se ha podido conectar con WhatsApp.' }
  }
}

/** Traduce los errores de Meta más habituales a algo accionable. */
function mensajeDeMeta(datos: any): string {
  const codigo = datos?.error?.code
  const detalle = datos?.error?.error_data?.details ?? datos?.error?.message ?? ''

  switch (codigo) {
    case 131026:
      return 'Ese número no tiene WhatsApp o no puede recibir mensajes.'
    case 132001:
      return 'La plantilla no existe o no está aprobada con ese nombre e idioma.'
    case 132000:
      return 'La plantilla espera un número de datos distinto del que se ha mandado.'
    case 132012:
      return 'Los botones de la plantilla no coinciden con los que espera la app. Revisa que sean dos botones de respuesta rápida y en este orden: confirmar primero, cancelar después.'
    case 190:
      return 'El token de WhatsApp ha caducado o ha sido revocado. Hay que generarlo de nuevo en Meta.'
    case 131047:
      return 'Han pasado más de 24 h desde el último mensaje del paciente y la plantilla no lo permite.'
    case 133010:
      return 'El número de la consulta no está dado de alta en la API de WhatsApp.'
    case 80007:
    case 130429:
      return 'Se ha superado el límite de mensajes de WhatsApp por ahora. Inténtalo más tarde.'
    default:
      return detalle
        ? `WhatsApp ha rechazado el envío: ${detalle}`
        : 'WhatsApp ha rechazado el envío.'
  }
}

/* ---------------------- Webhook ---------------------- */

/**
 * Comprueba que el aviso viene de Meta de verdad.
 *
 * El webhook está abierto a internet (Meta no manda sesión de Supabase),
 * así que esta firma es LO ÚNICO que separa un aviso legítimo de
 * cualquiera que conozca la URL. Se calcula sobre el cuerpo tal cual
 * llegó: si se vuelve a serializar el JSON, la firma ya no cuadra.
 */
export async function firmaValida(crudo: string, cabecera: string | null): Promise<boolean> {
  if (!APP_SECRET || !cabecera?.startsWith('sha256=')) return false
  const esperada = cabecera.slice('sha256='.length).toLowerCase()

  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(crudo))
  const calculada = [...new Uint8Array(firma)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Comparación en tiempo constante
  if (calculada.length !== esperada.length) return false
  let diferencia = 0
  for (let i = 0; i < calculada.length; i++) {
    diferencia |= calculada.charCodeAt(i) ^ esperada.charCodeAt(i)
  }
  return diferencia === 0
}

/** Estados de Meta -> el enum `estado_envio_whatsapp` de la base. */
export const ESTADO_DE_META: Record<string, string> = {
  sent: 'enviado',
  delivered: 'entregado',
  read: 'leido',
  failed: 'fallido',
}

/* Orden de avance. Meta manda los avisos por rachas y no siempre en
   orden: sin esto, un «entregado» que llega tarde borraría un «leído». */
export const ORDEN_ESTADO: Record<string, number> = {
  enviado: 1,
  entregado: 2,
  leido: 3,
  respondido: 4,
  fallido: 5,
}

/**
 * Qué botón ha pulsado el paciente.
 *
 * Se mira el texto y no la posición: si algún día se retoca la plantilla
 * en Meta y se cambian de sitio los botones, esto sigue acertando.
 */
export function respuestaDelBoton(texto: string | null | undefined): string | null {
  const limpio = String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // fuera tildes
    .trim()

  if (!limpio) return null
  if (/(^|\b)(no|cancel|anul)/.test(limpio)) return 'no_puedo'
  if (/(confirm|si|asisti|vale|ok|perfecto)/.test(limpio)) return 'confirmo'
  return null
}
