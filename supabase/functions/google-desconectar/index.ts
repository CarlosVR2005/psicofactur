/* ================================================================
   google-desconectar

   Retira el permiso. Dos cosas, en este orden:
     1. Se lo decimos a Google (revoke), para que el permiso desaparezca
        también de su cuenta y no quede una app suelta con acceso.
     2. Borramos los tokens de Vault y la fila de credenciales.

   Si el paso 1 falla (por ejemplo, porque ella ya lo revocó desde su
   cuenta de Google), el 2 se hace igual: lo que no puede quedarse es un
   refresh token nuestro sin que la app se considere desconectada.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import { revocar } from '../_shared/google.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const psicologaId = await psicologaDeLaPeticion(req)
  if (!psicologaId) {
    return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)
  }

  const admin = clienteAdmin()

  const { data } = await admin.rpc('google_leer_credenciales', { p_psicologa_id: psicologaId })
  const cred = Array.isArray(data) ? data[0] : data

  // Revocando el refresh token cae también el access token asociado
  if (cred?.refresh_token) await revocar(cred.refresh_token)

  const { error: errorBorrar } = await admin.rpc('google_borrar_credenciales', {
    p_psicologa_id: psicologaId,
  })
  const { error: errorMarcar } = await admin.rpc('google_marcar_desconectado', {
    p_psicologa_id: psicologaId,
  })

  if (errorBorrar || errorMarcar) {
    console.error('[Psicofactur] desconectar Google:', errorBorrar ?? errorMarcar)
    return json({ mensaje: 'No se ha podido desconectar del todo. Inténtalo otra vez.' }, 500)
  }

  return json({ ok: true })
})
