/* ================================================================
   google-oauth-callback

   Paso 2: Google devuelve el navegador aquí con un `code`.

   OJO: esta función se despliega SIN verificación de JWT. No puede ser
   de otra forma: quien llama es una redirección del navegador que viene
   de Google, sin cabecera de sesión de Supabase. Lo que autentica la
   petición es el `state`, que:
     · lo generamos nosotros en `google-oauth-start`,
     · sólo existe durante 10 minutos,
     · vale para un solo uso (se borra al leerlo),
     · y es lo único que dice de quién es esta autorización.

   Sin `state` válido, aquí no se guarda nada.
   ================================================================ */

import { clienteAdmin } from '../_shared/supabase.ts'
import { canjearCodigo, emailDelIdToken } from '../_shared/google.ts'

/** Vuelta a la app con el resultado en la URL, para que Ajustes lo cuente. */
function volver(origen: string, resultado: string): Response {
  return Response.redirect(`${origen}/ajustes?google=${resultado}`, 302)
}

function textoPlano(mensaje: string, estado = 400): Response {
  return new Response(mensaje, {
    status: estado,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorGoogle = url.searchParams.get('error')

  if (!state) return textoPlano('Falta el identificador de la autorización.')

  const admin = clienteAdmin()

  // Canjear el state: de un solo uso, dice quién es y a dónde volver
  const { data, error } = await admin.rpc('google_consumir_estado_oauth', { p_nonce: state })
  const estado = Array.isArray(data) ? data[0] : data

  if (error || !estado?.psicologa_id) {
    console.error('[Psicofactur] state inválido o caducado:', error)
    return textoPlano(
      'Esta autorización ha caducado o ya se ha usado. Vuelve a Ajustes e inténtalo otra vez.',
    )
  }

  const { psicologa_id: psicologaId, origen } = estado

  // Ella le ha dado a «Cancelar» en la pantalla de Google
  if (errorGoogle || !code) {
    return volver(origen, errorGoogle === 'access_denied' ? 'cancelado' : 'error')
  }

  try {
    const tokens = await canjearCodigo(code)

    if (!tokens.refresh_token) {
      // No debería pasar: pedimos access_type=offline + prompt=consent.
      // Si pasa, mejor enterarse ahora que dentro de una hora.
      console.error('[Psicofactur] Google no ha devuelto refresh_token')
      return volver(origen, 'sin_refresh')
    }

    const expiraEn = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000)
    const email = emailDelIdToken(tokens.id_token)

    const { error: errorGuardar } = await admin.rpc('google_guardar_credenciales', {
      p_psicologa_id: psicologaId,
      p_access_token: tokens.access_token,
      p_expira_en: expiraEn.toISOString(),
      p_refresh_token: tokens.refresh_token,
      p_cuenta_email: email,
    })
    if (errorGuardar) throw errorGuardar

    const { error: errorMarcar } = await admin.rpc('google_marcar_conectado', {
      p_psicologa_id: psicologaId,
      p_email: email,
    })
    if (errorMarcar) throw errorMarcar

    return volver(origen, 'ok')
  } catch (e) {
    console.error('[Psicofactur] fallo al conectar Google:', e)
    return volver(origen, 'error')
  }
})
