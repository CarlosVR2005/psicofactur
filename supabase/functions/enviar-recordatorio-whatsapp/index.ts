/* ================================================================
   enviar-recordatorio-whatsapp

   El recordatorio que se manda A MANO: ella pulsa Enviar en la pantalla
   de Recordatorios y sale al momento.

   El envío automático (24 h antes, sin que ella haga nada) es la otra
   función, `enviar-recordatorios-automaticos`. Las dos componen y
   anotan el mensaje con el mismo código: `_shared/recordatorio.ts`.

   Igual que con Google: del navegador sólo se acepta QUÉ cita. El
   nombre, la fecha y el teléfono se leen de la base con el RLS de ella
   puesto, para que nadie pueda mandar un mensaje a un número que no
   está en sus fichas.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteDeUsuaria, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import {
  COLUMNAS_CITA,
  configDeLaConsulta,
  enviarRecordatorio,
} from '../_shared/recordatorio.ts'
import { queFaltaPorConfigurar, whatsappConfigurado } from '../_shared/whatsapp.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const psicologaId = await psicologaDeLaPeticion(req)
  if (!psicologaId) return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)

  const cuerpo = await req.json().catch(() => ({}))

  /* La pantalla de Ajustes pregunta si el servidor tiene ya sus
     secretos, para saber qué contar. No manda nada. */
  if (cuerpo.comprobar) {
    return json({ configurado: whatsappConfigurado(), falta: queFaltaPorConfigurar() })
  }

  if (!whatsappConfigurado()) {
    return json({
      enviado: false,
      aviso:
        'WhatsApp no está configurado en el servidor. Faltan: ' +
        queFaltaPorConfigurar().join(', '),
    })
  }

  const citaId = cuerpo.citaId ? String(cuerpo.citaId) : null
  if (!citaId) return json({ mensaje: 'Falta la cita.' }, 400)

  const usuaria = clienteDeUsuaria(req)

  const { data: cita, error: errorCita } = await usuaria
    .from('citas')
    .select(COLUMNAS_CITA)
    .eq('id', citaId)
    .single()

  if (errorCita || !cita) {
    console.error('[Psicofactur] no se ha podido leer la cita:', errorCita)
    return json({ enviado: false, aviso: 'No se ha podido leer la cita.' })
  }

  const config = await configDeLaConsulta(usuaria, psicologaId)

  const resultado = await enviarRecordatorio(usuaria, {
    psicologaId,
    cita,
    config,
    origen: 'manual',
  })

  return json({
    enviado: resultado.enviado,
    aviso: resultado.aviso,
    registro: resultado.registro,
  })
})
