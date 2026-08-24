/* ================================================================
   CONSENTIMIENTO INFORMADO — lo que comparten las tres funciones

   `enviar-consentimiento` (con sesión) manda el enlace;
   `consentimiento-ver` y `consentimiento-firmar` (sin sesión) son las
   que usa el paciente desde el correo. Lo común vive aquí: el token, la
   caducidad, la versión del texto y el correo que se manda.
   ================================================================ */

/**
 * Versión del texto legal que se está firmando.
 *
 * TIENE QUE COINCIDIR con `VERSION_CONSENTIMIENTO` de
 * `src/lib/consentimiento.js`, que es donde vive el texto que lee el
 * paciente. Aquí sólo se guarda la etiqueta, y se guarda desde el
 * servidor a propósito: si la mandara el navegador, cualquiera podría
 * decir que firmó una versión distinta de la que vio.
 *
 * Al cambiar el clausulado se sube la fecha en los DOS sitios. Lo ya
 * firmado conserva la suya.
 */
export const VERSION_TEXTO = '2026-08'

/**
 * Cuánto vale el enlace. Uno que no caduca nunca es un enlace que sigue
 * abierto en el correo de un paciente que dejó la terapia hace tres
 * años. Reenviarlo desde la ficha crea uno nuevo y vuelve a empezar la
 * cuenta.
 */
export const DIAS_VALIDEZ = 30

/** Un token nuevo: 32 bytes aleatorios en hexadecimal (64 caracteres). */
export function nuevoToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** ¿Tiene forma de token nuestro? Evita ir a la base con cualquier cosa. */
export function tokenConForma(valor: unknown): boolean {
  return typeof valor === 'string' && /^[0-9a-f]{64}$/.test(valor)
}

/** ¿Ha caducado el enlace que se mandó en esa fecha? */
export function enlaceCaducado(fechaEnvio: string | null): boolean {
  if (!fechaEnvio) return false
  const limite = new Date(fechaEnvio).getTime() + DIAS_VALIDEZ * 24 * 60 * 60 * 1000
  return Date.now() > limite
}

/**
 * Desde dónde firma.
 *
 * Detrás de la CDN de Supabase quien abre la conexión es un proxy, así
 * que la IP de verdad viaja en `x-forwarded-for` (una lista: el primero
 * es el cliente). `remoteAddr` es el último recurso, el equivalente al
 * `req.socket.remoteAddress` de un servidor sin nada delante.
 */
export function ipDeLaPeticion(req: Request, info?: unknown): string {
  const reenviada = req.headers.get('x-forwarded-for') ?? ''
  const primera = reenviada.split(',')[0]?.trim()
  if (primera) return primera.slice(0, 60)

  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 60)

  const addr = (info as { remoteAddr?: { hostname?: string } } | undefined)?.remoteAddr
  return addr?.hostname ?? ''
}

/**
 * A dónde apunta el enlace del correo.
 *
 * `APP_URL` es la dirección pública de la PWA. Si no está puesta se cae
 * al primer origen de `APP_ORIGENES`, que ya existe desde Google, para
 * no configurar dos veces lo mismo.
 */
export function urlDeLaApp(): string {
  const explicita = (Deno.env.get('APP_URL') ?? '').trim()
  if (explicita) return explicita.replace(/\/+$/, '')

  const primerOrigen = (Deno.env.get('APP_ORIGENES') ?? '').split(',')[0]?.trim() ?? ''
  return primerOrigen.replace(/\/+$/, '')
}

export function enlaceDeFirma(token: string): string {
  return `${urlDeLaApp()}/consentimiento?token=${token}`
}

function escapar(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const ASUNTO_CONSENTIMIENTO =
  'Documento de Consentimiento Informado y Protección de Datos'

/* ----------------------------------------------------------------
   El correo

   Escrito con tablas y estilos en línea, no con flexbox ni clases: los
   clientes de correo (Outlook, Gmail, Mail del iPhone) tiran la mitad
   del CSS moderno. El botón es un <a> con relleno, que es lo único que
   se ve igual en todos, y el enlace se repite en texto debajo porque
   hay quien no puede pulsarlo.

   No lleva ni un dato clínico: nombre de pila, nombre de la consulta y
   el enlace. Mismo criterio que los recordatorios de WhatsApp.
   ---------------------------------------------------------------- */

export interface DatosCorreo {
  nombrePaciente: string
  consulta: string
  enlace: string
}

export function textoDelCorreo({ nombrePaciente, consulta, enlace }: DatosCorreo): string {
  const nombre = String(nombrePaciente ?? '').split(' ')[0]
  return [
    `Hola ${nombre}:`,
    '',
    'Antes de seguir con las sesiones necesito que firmes el consentimiento informado',
    'y la cláusula de protección de datos. Es un trámite de un minuto y se hace desde',
    'el propio móvil.',
    '',
    'Puedes leerlo y firmarlo aquí:',
    enlace,
    '',
    `El enlace es personal y caduca a los ${DIAS_VALIDEZ} días. Si te caduca, dímelo y te mando otro.`,
    '',
    'Un saludo,',
    consulta,
  ].join('\n')
}

export function htmlDelCorreo({ nombrePaciente, consulta, enlace }: DatosCorreo): string {
  const nombre = escapar(String(nombrePaciente ?? '').split(' ')[0])
  const laConsulta = escapar(consulta)
  const url = escapar(enlace)

  return `
<div style="background-color:#f7f5f2;padding:24px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid #e8e3dc;border-radius:18px">
    <tr>
      <td style="padding:28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2e2b28">
        <p style="margin:0 0 16px">Hola ${nombre}:</p>

        <p style="margin:0 0 16px">
          Antes de seguir con las sesiones necesito que firmes el
          <strong>consentimiento informado</strong> y la cl&aacute;usula de
          <strong>protecci&oacute;n de datos</strong>. Hace falta para poder atenderte y
          para poder tratar tus datos conforme al RGPD.
        </p>

        <p style="margin:0 0 24px;color:#6b655d">
          Se hace desde el propio m&oacute;vil: lees el documento, firmas con el dedo y ya
          est&aacute;. No tienes que imprimir ni traer nada.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td align="center" style="padding:4px 0 24px">
              <a href="${url}"
                 style="display:inline-block;background-color:#4f7c74;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
                Leer y firmar el documento
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 8px;font-size:13px;color:#9a938a">
          Si el bot&oacute;n no funciona, copia esta direcci&oacute;n en el navegador:
        </p>
        <p style="margin:0 0 20px;font-size:13px;word-break:break-all">
          <a href="${url}" style="color:#3f655e">${url}</a>
        </p>

        <p style="margin:0 0 20px;font-size:13px;color:#9a938a">
          El enlace es personal y caduca a los ${DIAS_VALIDEZ} d&iacute;as. Si te ha caducado,
          responde a este correo y te mando otro.
        </p>

        <p style="margin:0;padding-top:16px;border-top:1px solid #e8e3dc">
          Un saludo,<br>${laConsulta}
        </p>
      </td>
    </tr>
  </table>
</div>`.trim()
}
