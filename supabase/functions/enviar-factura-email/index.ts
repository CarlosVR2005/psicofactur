/* ================================================================
   enviar-factura-email

   Le manda al paciente su factura en PDF, al correo que tenga en la
   ficha.

   Del navegador se acepta SÓLO dos cosas: qué factura es y el PDF ya
   dibujado. **La dirección de destino no se acepta nunca**: se lee de
   la base con el RLS de la usuaria puesto. Es la diferencia entre un
   botón que manda la factura de un paciente a ese paciente y un
   formulario para mandar cualquier adjunto a cualquier dirección desde
   el dominio de la consulta.

   El PDF viaja desde el navegador en vez de generarse aquí porque es
   EXACTAMENTE el mismo que sale al pulsar «Descargar»: lo dibuja
   `pdfFactura.js` con jsPDF, con su QR y sus menciones obligatorias.
   Rehacerlo en Deno sería mantener dos veces el mismo documento legal,
   y el día que se desviaran, la copia del paciente y la de ella dirían
   cosas distintas.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteDeUsuaria, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import {
  emailConfigurado,
  enviarCorreo,
  ErrorEmail,
  queFaltaPorConfigurar,
} from '../_shared/email.ts'

/* Un PDF de una factura con su QR ronda los 100 KB; en base64, un tercio
   más. Se corta muy por encima de eso para que un cuerpo enorme no tumbe
   la función, pero sin quedarse corto con un logo grande. */
const MAXIMO_PDF_BASE64 = 6_000_000 // ~4,5 MB de PDF

/** Un correo con pinta de correo. No valida que exista, sólo la forma. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function euros(n: number): string {
  return `${Number(n ?? 0).toFixed(2).replace('.', ',')} €`
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  return String(iso).slice(0, 10).split('-').reverse().join('/')
}

function escapar(texto: string): string {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const psicologaId = await psicologaDeLaPeticion(req)
  if (!psicologaId) {
    return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)
  }

  if (!emailConfigurado()) {
    return json(
      {
        mensaje:
          'El envío de facturas por correo todavía no está configurado. Avisa a quien lleva la aplicación.',
        configuracion_incompleta: true,
        faltan: queFaltaPorConfigurar(),
      },
      503,
    )
  }

  let cuerpo: { factura_id?: string; pdf_base64?: string; nombre_fichero?: string }
  try {
    cuerpo = await req.json()
  } catch (_) {
    return json({ mensaje: 'No se ha recibido qué factura hay que mandar.' }, 400)
  }

  const facturaId = cuerpo.factura_id
  const pdf = cuerpo.pdf_base64 ?? ''

  if (!facturaId) {
    return json({ mensaje: 'No se ha recibido qué factura hay que mandar.' }, 400)
  }
  if (!pdf) {
    return json({ mensaje: 'No se ha recibido el PDF de la factura.' }, 400)
  }
  if (pdf.length > MAXIMO_PDF_BASE64) {
    return json({ mensaje: 'El PDF de la factura es demasiado grande para enviarlo.' }, 413)
  }

  const db = clienteDeUsuaria(req)

  /* ---------- 1. La factura, con el RLS de la usuaria ----------
     Si la factura no es suya, esta consulta no la encuentra. Es lo que
     impide mandar la factura de otra consulta. */
  const { data: factura, error: errorFactura } = await db
    .from('facturas')
    .select(
      `id, numero_factura, importe, fecha_emision, verifactu_estado, emitida_at,
       paciente:pacientes!facturas_paciente_id_fkey (nombre, correo),
       cita:citas!facturas_cita_id_fkey (fecha_hora)`,
    )
    .eq('id', facturaId)
    .single()

  if (errorFactura || !factura) {
    return json({ mensaje: 'No se ha encontrado esa factura.' }, 404)
  }

  /* ---------- 2. ¿Está en condiciones de mandarse? ----------

     Tiene que estar CERRADA. Con Veri*Factu eso significa que Hacienda
     la ha aceptado (su QR apunta a un registro real); sin Veri*Factu
     basta con que se haya pulsado «Emitir» (`emitida_at`).

     Se comprueba AQUÍ además de en la pantalla: el botón se puede
     saltar, esto no. */
  const cerrada =
    Boolean(factura.emitida_at) || factura.verifactu_estado === 'Correcto'
  if (!cerrada) {
    return json(
      {
        mensaje:
          factura.verifactu_estado === 'Incorrecto'
            ? 'Hacienda rechazó esa factura, así que no se le puede mandar al paciente. Subsánala primero.'
            : factura.verifactu_estado === 'Pendiente'
              ? 'Esa factura todavía no la ha aceptado Hacienda. Espera a que se confirme antes de mandarla.'
              : 'Esa factura todavía no está emitida. Púlsale «Emitir» antes de mandarla.',
      },
      400,
    )
  }

  /* ---------- 3. A dónde va ----------
     De la ficha del paciente, NUNCA de lo que mande el navegador. */
  const paciente = (factura as any).paciente
  const destino = String(paciente?.correo ?? '').trim()

  if (!destino) {
    return json(
      {
        mensaje: `${paciente?.nombre ?? 'Este paciente'} no tiene ningún correo en su ficha. Ponle uno y vuelve a intentarlo.`,
        sin_email: true,
      },
      400,
    )
  }
  if (!EMAIL.test(destino)) {
    return json(
      {
        mensaje: `El correo que tiene ${paciente?.nombre ?? 'este paciente'} en su ficha («${destino}») no parece válido. Revísalo.`,
        sin_email: true,
      },
      400,
    )
  }

  /* ---------- 4. Quién lo manda ---------- */
  const { data: psicologa } = await db
    .from('psicologas')
    .select('nombre, razon_social, email')
    .eq('id', psicologaId)
    .single()

  const consulta = String(
    psicologa?.razon_social || psicologa?.nombre || 'Tu psicóloga',
  ).trim()

  /* ---------- 5. El correo ---------- */
  const numero = factura.numero_factura ?? ''
  const sesion = (factura as any).cita?.fecha_hora
    ? new Date((factura as any).cita.fecha_hora).toLocaleDateString('en-CA', {
        timeZone: 'Europe/Madrid',
      })
    : null

  const laSesion = sesion ? ` de la sesión del ${fechaCorta(sesion)}` : ''
  const asunto = `Factura ${numero} · ${consulta}`

  const texto = [
    `Hola ${String(paciente?.nombre ?? '').split(' ')[0]}:`,
    '',
    `Te adjunto la factura ${numero}${laSesion}, por un importe de ${euros(Number(factura.importe))}.`,
    '',
    'Un saludo,',
    consulta,
  ].join('\n')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2f2b26;max-width:520px">
      <p>Hola ${escapar(String(paciente?.nombre ?? '').split(' ')[0])}:</p>
      <p>
        Te adjunto la factura <strong>${escapar(numero)}</strong>${escapar(laSesion)},
        por un importe de <strong>${escapar(euros(Number(factura.importe)))}</strong>.
      </p>
      <p style="color:#6b645b;font-size:14px">
        La llevas en el PDF adjunto. Si tienes cualquier duda, puedes responder a este correo.
      </p>
      <p>Un saludo,<br>${escapar(consulta)}</p>
    </div>
  `.trim()

  const nombreFichero =
    String(cuerpo.nombre_fichero ?? '').trim() ||
    `Factura ${String(numero).replace(/\//g, '-')}.pdf`

  try {
    await enviarCorreo({
      para: destino,
      paraNombre: paciente?.nombre ?? null,
      asunto,
      html,
      texto,
      // Que el paciente pueda contestarle a ella, no al remitente técnico
      responderA: psicologa?.email ?? null,
      adjuntos: [{ nombre: nombreFichero, contenidoBase64: pdf }],
    })
  } catch (e) {
    const fallo = e instanceof ErrorEmail ? e : null
    console.error('[Psicofactur] no se pudo enviar la factura:', fallo?.tecnico ?? e)

    /* Un 4xx del proveedor es un problema de lo que se le ha mandado
       —dirección mal, remitente sin autenticar, cuota agotada— y lo
       arregla ella. Un 5xx es de ellos, y ahí sí toca reintentar. */
    const esCulpaNuestra =
      fallo?.estadoHttp && fallo.estadoHttp >= 400 && fallo.estadoHttp < 500

    return json(
      { mensaje: fallo?.mensaje ?? 'No se ha podido enviar el correo.' },
      esCulpaNuestra ? 400 : 502,
    )
  }

  /* ---------- 6. Queda apuntado ----------
     El correo ya ha salido. Si esto fallara, lo único que se pierde es
     el «enviada el…» de la pantalla, así que no se devuelve error: sería
     mentirle diciendo que no se ha mandado algo que sí se ha mandado. */
  const enviadoEn = new Date().toISOString()

  const { error: errorApuntar } = await db
    .from('facturas')
    .update({ email_enviado_at: enviadoEn, email_destinatario: destino })
    .eq('id', factura.id)

  if (errorApuntar) {
    console.error('[Psicofactur] factura enviada pero no apuntada:', errorApuntar)
  }

  return json({
    enviada: true,
    destinatario: destino,
    enviada_at: enviadoEn,
    numero_factura: numero,
  })
})
