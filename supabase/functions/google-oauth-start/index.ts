/* ================================================================
   google-oauth-start

   Paso 1 de la conexión: la app pide «llévame a Google».

   Aquí sí hace falta sesión de Supabase (verify_jwt = true): es lo que
   nos dice de QUIÉN va a ser el permiso. Guardamos esa identidad contra
   un `state` aleatorio y devolvemos la URL de consentimiento; el
   navegador se va a Google y vuelve a `google-oauth-callback`.
   ================================================================ */

import { cabecerasCors, json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import { googleConfigurado, urlDeConsentimiento } from '../_shared/google.ts'

/* A dónde se puede devolver el navegador al terminar. Se comprueba para
   que nadie pueda usar esta función como trampolín hacia otra web. */
const ORIGENES = (Deno.env.get('APP_ORIGENES') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const ES_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function origenPermitido(origen: string): boolean {
  return ORIGENES.includes(origen) || ES_LOCAL.test(origen)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  if (!googleConfigurado()) {
    return json(
      { mensaje: 'Falta configurar Google en el servidor (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' },
      500,
    )
  }

  const psicologaId = await psicologaDeLaPeticion(req)
  if (!psicologaId) {
    return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)
  }

  const cuerpo = await req.json().catch(() => ({}))
  const origen = String(cuerpo.origen ?? req.headers.get('Origin') ?? '')

  if (!origenPermitido(origen)) {
    console.error('[Psicofactur] origen no permitido:', origen)
    return json(
      { mensaje: 'Esta dirección de la aplicación no está autorizada para conectar Google.' },
      400,
    )
  }

  const admin = clienteAdmin()
  const { data: state, error } = await admin.rpc('google_crear_estado_oauth', {
    p_psicologa_id: psicologaId,
    p_origen: origen,
  })

  if (error || !state) {
    console.error('[Psicofactur] google_crear_estado_oauth:', error)
    return json({ mensaje: 'No se ha podido iniciar la conexión con Google.' }, 500)
  }

  return new Response(JSON.stringify({ url: urlDeConsentimiento(state) }), {
    headers: { ...cabecerasCors, 'Content-Type': 'application/json' },
  })
})
