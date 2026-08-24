/* ================================================================
   CORREO SALIENTE (Brevo)

   Todo lo que habla con el proveedor de correo vive aquí, igual que
   `verifacti.ts` para la AEAT y `whatsapp.ts` para Meta. Nadie más sabe
   qué servicio manda los correos.

   Se eligió Brevo y no Resend por un motivo concreto: aquí viajan
   direcciones de pacientes y asuntos con el número de su factura, o
   sea, el rastro de quién va a una consulta de psicología. Brevo aloja
   todo eso en la UE (Francia, Alemania y Bélgica); Resend despacha
   desde Irlanda si se le pide, pero los logs y metadatos se le quedan
   en Estados Unidos. Con datos sanitarios, eso decide.

   Secretos que hay que poner en Supabase → Edge Functions → Secrets:

     BREVO_API_KEY      la clave de https://brevo.com (empieza por xkeysib-)
     BREVO_FROM         el remitente: facturas@psicologaenlanzarote.com
     BREVO_FROM_NOMBRE  opcional, el nombre que ve el paciente

   El remitente tiene que ser de un dominio AUTENTICADO en Brevo. Si no
   lo está, o el correo se va a spam o lo rechazan: es lo primero que
   hay que mirar si esto falla el primer día.
   ================================================================ */

const API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const FROM = Deno.env.get('BREVO_FROM') ?? ''
const FROM_NOMBRE = Deno.env.get('BREVO_FROM_NOMBRE') ?? ''

const API = 'https://api.brevo.com/v3/smtp/email'

/* Brevo corta el nombre visible a 70 caracteres. Se recorta aquí en vez
   de dejar que la API devuelva un 400 por un nombre largo. */
const MAXIMO_NOMBRE = 70

export function emailConfigurado(): boolean {
  return Boolean(API_KEY && FROM)
}

/** Qué falta por configurar, para poder decirlo en pantalla. */
export function queFaltaPorConfigurar(): string[] {
  const falta: string[] = []
  if (!API_KEY) falta.push('BREVO_API_KEY')
  if (!FROM) falta.push('BREVO_FROM')
  return falta
}

export class ErrorEmail extends Error {
  /** Lo que se le enseña a la psicóloga */
  mensaje: string
  /** El detalle crudo del proveedor, para la consola */
  tecnico: string
  estadoHttp: number

  constructor(mensaje: string, tecnico: string, estadoHttp = 0) {
    super(mensaje)
    this.mensaje = mensaje
    this.tecnico = tecnico
    this.estadoHttp = estadoHttp
  }
}

export interface Adjunto {
  /** Nombre con el que lo verá quien reciba el correo */
  nombre: string
  /** El fichero en base64, SIN el prefijo `data:` */
  contenidoBase64: string
}

export interface CorreoSaliente {
  para: string
  /** Nombre de quien lo recibe, para que no le llegue sólo la dirección */
  paraNombre?: string | null
  asunto: string
  html: string
  texto: string
  /** A dónde contesta el paciente si le da a Responder */
  responderA?: string | null
  adjuntos?: Adjunto[]
}

function recortar(texto: string): string {
  return String(texto).slice(0, MAXIMO_NOMBRE)
}

/**
 * Manda un correo. Devuelve el `messageId` de Brevo, que sirve para
 * buscarlo en su panel si algún día hay que rastrear un envío.
 */
export async function enviarCorreo(correo: CorreoSaliente): Promise<string> {
  if (!emailConfigurado()) {
    throw new ErrorEmail(
      'El envío de correos todavía no está configurado. Avisa a quien lleva la aplicación.',
      `faltan secretos: ${queFaltaPorConfigurar().join(', ')}`,
    )
  }

  let respuesta: Response
  try {
    respuesta = await fetch(API, {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: FROM,
          ...(FROM_NOMBRE ? { name: recortar(FROM_NOMBRE) } : {}),
        },
        to: [
          {
            email: correo.para,
            ...(correo.paraNombre ? { name: recortar(correo.paraNombre) } : {}),
          },
        ],
        subject: correo.asunto,
        htmlContent: correo.html,
        textContent: correo.texto,
        ...(correo.responderA ? { replyTo: { email: correo.responderA } } : {}),
        ...(correo.adjuntos?.length
          ? {
              attachment: correo.adjuntos.map((a) => ({
                name: a.nombre,
                content: a.contenidoBase64,
              })),
            }
          : {}),
      }),
    })
  } catch (e) {
    throw new ErrorEmail(
      'No se ha podido contactar con el servicio de correo. Inténtalo de nuevo en unos segundos.',
      String(e),
    )
  }

  const cuerpo = await respuesta.text()

  /* Brevo responde 201 al mandarlo y 202 si lo deja programado. Cualquier
     2xx es que lo ha aceptado. */
  if (!respuesta.ok) {
    /* Los fallos que de verdad pasan tienen arreglos muy distintos, así
       que se distinguen en vez de soltar un «error» genérico. */
    let mensaje = 'No se ha podido enviar el correo. Inténtalo de nuevo.'

    if (respuesta.status === 401) {
      mensaje =
        'El servicio de correo ha rechazado la clave. Revisa BREVO_API_KEY en los secretos.'
    } else if (respuesta.status === 400) {
      /* El 400 de Brevo es ambiguo: tanto un destinatario mal escrito
         como un remitente cuyo dominio no está autenticado. Se mira el
         código que devuelve para no mandarla a revisar la ficha del
         paciente cuando el problema es la configuración. */
      mensaje = cuerpo.includes('sender')
        ? 'Brevo no acepta ese remitente. Comprueba que el dominio esté autenticado y que BREVO_FROM sea una dirección suya.'
        : 'La dirección de correo del paciente no parece válida. Revísala en su ficha.'
    } else if (respuesta.status === 402 || respuesta.status === 429) {
      mensaje =
        'Se ha alcanzado el límite de correos de Brevo por ahora. Prueba dentro de un rato.'
    }

    throw new ErrorEmail(mensaje, cuerpo, respuesta.status)
  }

  try {
    return JSON.parse(cuerpo)?.messageId ?? ''
  } catch (_) {
    return ''
  }
}
