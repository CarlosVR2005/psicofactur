/* ================================================================
   enviar-consentimiento

   Le manda al paciente el enlace para leer y firmar el consentimiento
   informado y la cláusula de protección de datos.

   Del navegador se acepta SÓLO el id del paciente. La dirección de
   destino se lee de su ficha con el RLS de la usuaria puesto, igual que
   en `enviar-factura-email` y por lo mismo: si se aceptara del cliente,
   el botón sería un formulario para mandar correos desde el dominio de
   la consulta a donde a uno le apeteciera.

   El token se genera AQUÍ y no se devuelve nunca al navegador. La
   pantalla no necesita el enlace —no hay nada que copiar y pegar— y
   quien tenga el token puede firmar por el paciente.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteDeUsuaria, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import {
  emailConfigurado,
  enviarCorreo,
  ErrorEmail,
  queFaltaPorConfigurar,
} from '../_shared/email.ts'
import {
  ASUNTO_CONSENTIMIENTO,
  enlaceDeFirma,
  htmlDelCorreo,
  nuevoToken,
  textoDelCorreo,
  urlDeLaApp,
} from '../_shared/consentimiento.ts'

/** Un correo con pinta de correo. No valida que exista, sólo la forma. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

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
          'El envío de correos todavía no está configurado. Avisa a quien lleva la aplicación.',
        configuracion_incompleta: true,
        faltan: queFaltaPorConfigurar(),
      },
      503,
    )
  }

  /* Sin dirección pública no hay enlace que mandar: el correo saldría
     con un botón que no lleva a ninguna parte. Mejor no mandarlo. */
  if (!urlDeLaApp()) {
    return json(
      {
        mensaje:
          'Falta decir en qué dirección está la aplicación (APP_URL). Avisa a quien la lleva.',
        configuracion_incompleta: true,
        faltan: ['APP_URL'],
      },
      503,
    )
  }

  let cuerpo: { paciente_id?: string }
  try {
    cuerpo = await req.json()
  } catch (_) {
    return json({ mensaje: 'No se ha recibido a qué paciente hay que mandárselo.' }, 400)
  }

  const pacienteId = cuerpo.paciente_id
  if (!pacienteId) {
    return json({ mensaje: 'No se ha recibido a qué paciente hay que mandárselo.' }, 400)
  }

  const db = clienteDeUsuaria(req)

  /* ---------- 1. El paciente, con el RLS de la usuaria ----------
     Si no es suyo, esta consulta no lo encuentra. */
  const { data: paciente, error: errorPaciente } = await db
    .from('pacientes')
    .select(
      'id, nombre, correo, consentimiento_estado, consentimiento_token, consentimiento_fecha_envio',
    )
    .eq('id', pacienteId)
    .single()

  if (errorPaciente || !paciente) {
    return json({ mensaje: 'No se ha encontrado ese paciente.' }, 404)
  }

  /* ---------- 2. ¿Hay algo que mandar? ----------
     Un consentimiento firmado no se vuelve a pedir: mandarlo otra vez
     invitaría a firmar dos veces el mismo documento, y el registro que
     vale es el primero. Para rehacerlo hace falta cambiar el texto y
     subir su versión, que es otra conversación. */
  if (paciente.consentimiento_estado === 'FIRMADO') {
    return json(
      {
        mensaje: `${paciente.nombre} ya firmó el consentimiento. No hace falta volver a mandárselo.`,
        ya_firmado: true,
      },
      400,
    )
  }

  /* ---------- 3. A dónde va ----------
     De la ficha, nunca de lo que mande el navegador. */
  const destino = String(paciente.correo ?? '').trim()

  if (!destino) {
    return json(
      {
        mensaje: `${paciente.nombre} no tiene ningún correo en su ficha. Ponle uno y vuelve a intentarlo.`,
        sin_email: true,
      },
      400,
    )
  }
  if (!EMAIL.test(destino)) {
    return json(
      {
        mensaje: `El correo que tiene ${paciente.nombre} en su ficha («${destino}») no parece válido. Revísalo.`,
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

  /* ---------- 5. El token, ANTES de mandar el correo ----------
     Al revés no se puede: si el correo saliera primero, el paciente
     podría abrir el enlace antes de que exista en la base. Un token
     nuevo cada vez, aunque sea un reenvío: el anterior deja de valer en
     cuanto se sobreescribe, así que un correo viejo reenviado a un
     tercero se queda muerto. */
  const token = nuevoToken()
  const enviadoEn = new Date().toISOString()

  const anterior = {
    consentimiento_estado: paciente.consentimiento_estado ?? 'NO_ENVIADO',
    consentimiento_token: paciente.consentimiento_token ?? null,
    consentimiento_fecha_envio: paciente.consentimiento_fecha_envio ?? null,
  }

  const { error: errorGuardar } = await db
    .from('pacientes')
    .update({
      consentimiento_estado: 'PENDIENTE',
      consentimiento_token: token,
      consentimiento_fecha_envio: enviadoEn,
    })
    .eq('id', paciente.id)

  if (errorGuardar) {
    console.error('[Psicofactur] no se pudo guardar el token de consentimiento:', errorGuardar)
    return json({ mensaje: 'No se ha podido preparar el enlace de firma. Inténtalo de nuevo.' }, 500)
  }

  /* ---------- 6. El correo ---------- */
  const datosCorreo = {
    nombrePaciente: paciente.nombre,
    consulta,
    enlace: enlaceDeFirma(token),
  }

  try {
    await enviarCorreo({
      para: destino,
      paraNombre: paciente.nombre,
      asunto: ASUNTO_CONSENTIMIENTO,
      html: htmlDelCorreo(datosCorreo),
      texto: textoDelCorreo(datosCorreo),
      // Que el paciente pueda contestarle a ella, no al remitente técnico
      responderA: psicologa?.email ?? null,
    })
  } catch (e) {
    const fallo = e instanceof ErrorEmail ? e : null
    console.error('[Psicofactur] no se pudo enviar el consentimiento:', fallo?.tecnico ?? e)

    /* El correo no ha salido, así que la ficha no puede quedarse en
       «esperando respuesta»: estaría esperando algo que nadie ha
       recibido. Se deshace lo del paso 5 y la pantalla vuelve a
       ofrecer el botón de enviar. */
    const { error: errorDeshacer } = await db
      .from('pacientes')
      .update(anterior)
      .eq('id', paciente.id)

    if (errorDeshacer) {
      console.error('[Psicofactur] token puesto pero correo no enviado:', errorDeshacer)
    }

    const esCulpaNuestra =
      fallo?.estadoHttp && fallo.estadoHttp >= 400 && fallo.estadoHttp < 500

    return json(
      { mensaje: fallo?.mensaje ?? 'No se ha podido enviar el correo.' },
      esCulpaNuestra ? 400 : 502,
    )
  }

  return json({
    enviado: true,
    estado: 'PENDIENTE',
    destinatario: destino,
    fecha_envio: enviadoEn,
  })
})
