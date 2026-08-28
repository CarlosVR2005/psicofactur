/* ================================================================
   enviar-consentimiento

   Le manda el enlace para leer y firmar el consentimiento informado y
   la cláusula de protección de datos.

   Quién lo recibe lo decide ESTA función, no el navegador, a partir de
   la fecha de nacimiento del paciente:

     · menor de 16  →  un enlace para cada progenitor con correo en la
                       ficha. Firman por separado (Ley 41/2002).
     · 16 o más     →  un enlace al propio paciente, como siempre.

   Del navegador se acepta SÓLO el id del paciente. Los correos de
   destino se leen de su ficha con el RLS de la usuaria puesto, por lo
   mismo que en `enviar-factura-email`: si se aceptaran del cliente, el
   botón sería un formulario para mandar correos desde el dominio de la
   consulta a donde apeteciera.

   Cada firmante es una fila de `consentimiento_firmantes` con su token.
   El token se genera aquí y no se devuelve nunca.
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
  firmanLosProgenitores,
  htmlDelCorreo,
  nuevoToken,
  textoDelCorreo,
  urlDeLaApp,
} from '../_shared/consentimiento.ts'

/** Un correo con pinta de correo. No valida que exista, sólo la forma. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

interface Destino {
  rol: 'PACIENTE' | 'PROGENITOR_1' | 'PROGENITOR_2'
  correo: string
  nombre: string
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
          'El envío de correos todavía no está configurado. Avisa a quien lleva la aplicación.',
        configuracion_incompleta: true,
        faltan: queFaltaPorConfigurar(),
      },
      503,
    )
  }

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

  /* ---------- 1. El paciente, con el RLS de la usuaria ---------- */
  const { data: paciente, error: errorPaciente } = await db
    .from('pacientes')
    .select(
      `id, nombre, correo, fecha_nacimiento,
       progenitor1_nombre, progenitor1_correo,
       progenitor2_nombre, progenitor2_correo`,
    )
    .eq('id', pacienteId)
    .single()

  if (errorPaciente || !paciente) {
    return json({ mensaje: 'No se ha encontrado ese paciente.' }, 404)
  }

  /* ---------- 2. ¿A quién se le manda? ---------- */
  const porProgenitores = firmanLosProgenitores(paciente.fecha_nacimiento)
  const destinos: Destino[] = []
  let aviso: string | null = null

  if (porProgenitores) {
    const progenitores: Array<[Destino['rol'], string, string]> = [
      ['PROGENITOR_1', String(paciente.progenitor1_correo ?? '').trim(), String(paciente.progenitor1_nombre ?? '').trim()],
      ['PROGENITOR_2', String(paciente.progenitor2_correo ?? '').trim(), String(paciente.progenitor2_nombre ?? '').trim()],
    ]
    for (const [rol, correo, nombre] of progenitores) {
      if (correo && EMAIL.test(correo)) {
        destinos.push({ rol, correo, nombre: nombre || 'Progenitor o tutor' })
      }
    }

    if (destinos.length === 0) {
      return json(
        {
          mensaje: `${paciente.nombre} es menor de 16 años: el consentimiento lo firman sus progenitores, y no hay ningún correo suyo en la ficha. Añádelos y vuelve a intentarlo.`,
          sin_email: true,
          faltan_progenitores: true,
        },
        400,
      )
    }
    if (destinos.length === 1) {
      aviso =
        'Sólo hay un progenitor con correo en la ficha. El consentimiento de un menor lo tienen que firmar los dos: añade el correo del otro para mandárselo también.'
    }
  } else {
    const correo = String(paciente.correo ?? '').trim()
    if (!correo) {
      return json(
        {
          mensaje: `${paciente.nombre} no tiene ningún correo en su ficha. Ponle uno y vuelve a intentarlo.`,
          sin_email: true,
        },
        400,
      )
    }
    if (!EMAIL.test(correo)) {
      return json(
        {
          mensaje: `El correo que tiene ${paciente.nombre} en su ficha («${correo}») no parece válido. Revísalo.`,
          sin_email: true,
        },
        400,
      )
    }
    destinos.push({ rol: 'PACIENTE', correo, nombre: paciente.nombre })
  }

  /* ---------- 3. Los que ya firmaron no se vuelven a molestar ---------- */
  const { data: firmantes } = await db
    .from('consentimiento_firmantes')
    .select('rol, estado')
    .eq('paciente_id', paciente.id)

  const yaFirmado = new Set(
    (firmantes ?? []).filter((f) => f.estado === 'FIRMADO').map((f) => f.rol),
  )

  const pendientesDeEnviar = destinos.filter((d) => !yaFirmado.has(d.rol))

  if (pendientesDeEnviar.length === 0) {
    return json(
      {
        mensaje: `${paciente.nombre} ya tiene el consentimiento firmado. No hace falta volver a mandarlo.`,
        ya_firmado: true,
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

  /* ---------- 5. Una fila y un correo por firmante ---------- */
  const enviadoEn = new Date().toISOString()
  const envios: Array<{ rol: string; destinatario: string; ok: boolean; mensaje?: string }> = []

  for (const destino of pendientesDeEnviar) {
    const token = nuevoToken()

    // El token se guarda ANTES de mandar el correo: si saliera primero,
    // el enlace podría abrirse antes de existir en la base.
    const { error: errorGuardar } = await db
      .from('consentimiento_firmantes')
      .upsert(
        {
          paciente_id: paciente.id,
          psicologa_id: psicologaId,
          rol: destino.rol,
          destinatario_correo: destino.correo,
          destinatario_nombre: destino.nombre,
          estado: 'PENDIENTE',
          token,
          fecha_envio: enviadoEn,
          fecha_firma: null,
          firma_data: null,
          ip: null,
          nombre: null,
          dni: null,
          version: null,
        },
        { onConflict: 'paciente_id,rol' },
      )

    if (errorGuardar) {
      console.error('[Psicofactur] no se pudo preparar el enlace de firma:', errorGuardar)
      envios.push({
        rol: destino.rol,
        destinatario: destino.correo,
        ok: false,
        mensaje: 'No se ha podido preparar el enlace.',
      })
      continue
    }

    const datosCorreo = {
      nombrePaciente: paciente.nombre,
      consulta,
      enlace: enlaceDeFirma(token),
      rol: destino.rol,
    }

    try {
      await enviarCorreo({
        para: destino.correo,
        paraNombre: destino.nombre,
        asunto: ASUNTO_CONSENTIMIENTO,
        html: htmlDelCorreo(datosCorreo),
        texto: textoDelCorreo(datosCorreo),
        responderA: psicologa?.email ?? null,
      })
      envios.push({ rol: destino.rol, destinatario: destino.correo, ok: true })
    } catch (e) {
      const fallo = e instanceof ErrorEmail ? e : null
      console.error('[Psicofactur] no se pudo enviar el consentimiento:', fallo?.tecnico ?? e)

      /* El correo no ha salido: esta fila no puede quedarse «esperando
         respuesta». Se borra el token para que un enlace que nadie ha
         recibido no valga. */
      await db
        .from('consentimiento_firmantes')
        .update({ token: null })
        .eq('paciente_id', paciente.id)
        .eq('rol', destino.rol)

      envios.push({
        rol: destino.rol,
        destinatario: destino.correo,
        ok: false,
        mensaje: fallo?.mensaje ?? 'No se ha podido enviar el correo.',
      })
    }
  }

  const algunoOk = envios.some((e) => e.ok)
  if (!algunoOk) {
    return json(
      {
        mensaje:
          envios[0]?.mensaje ?? 'No se ha podido enviar el consentimiento.',
        envios,
      },
      502,
    )
  }

  return json({
    enviado: true,
    envios,
    fecha_envio: enviadoEn,
    aviso,
  })
})
