/* ================================================================
   GOOGLE — OAuth y tokens

   Todo lo que habla con Google vive aquí. Las Edge Functions no
   construyen URLs ni llaman al endpoint de tokens por su cuenta.

   El Client Secret NUNCA sale de este lado: es un secreto de las Edge
   Functions (`supabase secrets set`), no una variable del navegador.
   ================================================================ */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

/**
 * Tiene que coincidir EXACTAMENTE con la URI autorizada en Google Cloud
 * Console, tanto al pedir el consentimiento como al canjear el código.
 */
export const URL_REDIRECCION = `${SUPABASE_URL}/functions/v1/google-oauth-callback`

/**
 * `calendar.events` es el permiso mínimo: crear y editar eventos, sin ver
 * la lista de calendarios ni la configuración de la cuenta.
 * `openid email` es sólo para poder enseñar «Conectado como …» en Ajustes.
 */
export const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'].join(
  ' ',
)

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export function googleConfigurado(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET)
}

/** Error con mensaje ya escrito para la pantalla. */
export class ErrorGoogle extends Error {
  /** true = hay que volver a pasar por el consentimiento de Google */
  reconectar: boolean
  tecnico: unknown

  constructor(mensaje: string, opciones: { reconectar?: boolean; tecnico?: unknown } = {}) {
    super(mensaje)
    this.name = 'ErrorGoogle'
    this.reconectar = opciones.reconectar ?? false
    this.tecnico = opciones.tecnico
  }
}

/* ---------------------- Consentimiento ---------------------- */

/**
 * URL a la que mandamos el navegador para que Google pida permiso.
 *
 * `access_type=offline` + `prompt=consent` es lo que garantiza que Google
 * devuelva refresh_token. Sin ellos, en la segunda autorización Google se
 * limita a dar un access_token de una hora y la sincronización en segundo
 * plano se muere en cuanto caduca.
 */
export function urlDeConsentimiento(state: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: URL_REDIRECCION,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

/* ------------------------- Tokens ------------------------- */

interface RespuestaToken {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
  scope?: string
}

async function pedirToken(cuerpo: Record<string, string>): Promise<RespuestaToken> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cuerpo),
  })
  const datos = await r.json().catch(() => null)

  if (!r.ok) {
    // `invalid_grant` = el permiso ya no vale (revocado, caducado o code
    // reutilizado). Es el único caso en el que hay que reconectar.
    const invalido = datos?.error === 'invalid_grant'
    throw new ErrorGoogle(
      invalido
        ? 'Google ha retirado el permiso. Hay que volver a conectar la cuenta.'
        : 'Google no ha aceptado la petición.',
      { reconectar: invalido, tecnico: datos },
    )
  }
  return datos as RespuestaToken
}

/** Primer canje: el `code` de la redirección por los tokens de verdad. */
export function canjearCodigo(code: string) {
  return pedirToken({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: URL_REDIRECCION,
    grant_type: 'authorization_code',
  })
}

/** Renovación silenciosa con el refresh token. */
export function refrescarToken(refreshToken: string) {
  return pedirToken({
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
}

/** Retira el permiso en Google. Si falla, da igual: igualmente lo borramos. */
export async function revocar(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    })
  } catch (_) {
    // sin ruido
  }
}

/**
 * Email de la cuenta de Google, sacado del id_token.
 * No hace falta verificar la firma: el id_token viene por HTTPS
 * directamente de Google, no del navegador.
 */
export function emailDelIdToken(idToken?: string): string | null {
  if (!idToken) return null
  try {
    const carga = idToken.split('.')[1]
    const json = atob(carga.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)?.email ?? null
  } catch (_) {
    return null
  }
}

/* ------------------- Token vivo (reutilizable) ------------------- */

/**
 * Devuelve un access_token válido para esa psicóloga, renovándolo con el
 * refresh token si le queda menos de un minuto de vida.
 *
 * ESTA ES LA FUNCIÓN QUE USAN TODAS LAS DEMÁS EDGE FUNCTIONS: crear la
 * cita en Google, actualizarla, borrarla y leer los cambios. Nadie más
 * habla con el endpoint de tokens.
 *
 * @throws {ErrorGoogle} con `reconectar: true` si el permiso ya no vale.
 *         Antes de lanzarlo deja constancia en la ficha de la psicóloga,
 *         para que Ajustes lo enseñe y no falle en silencio.
 */
export async function accessTokenValido(
  admin: SupabaseClient,
  psicologaId: string,
): Promise<string> {
  const { data, error } = await admin.rpc('google_leer_credenciales', {
    p_psicologa_id: psicologaId,
  })
  if (error) throw new ErrorGoogle('No se han podido leer las credenciales.', { tecnico: error })

  const cred = Array.isArray(data) ? data[0] : data
  if (!cred?.refresh_token) {
    throw new ErrorGoogle('Google Calendar no está conectado.', { reconectar: true })
  }

  const margen = 60_000 // un minuto, para no pillarlo justo al caducar
  const caduca = cred.access_expira_en ? new Date(cred.access_expira_en).getTime() : 0
  if (cred.access_token && Date.now() < caduca - margen) {
    return cred.access_token
  }

  try {
    const nuevo = await refrescarToken(cred.refresh_token)
    const expiraEn = new Date(Date.now() + Number(nuevo.expires_in ?? 3600) * 1000)

    await admin.rpc('google_guardar_credenciales', {
      p_psicologa_id: psicologaId,
      p_access_token: nuevo.access_token,
      p_expira_en: expiraEn.toISOString(),
      // Al refrescar, Google no repite el refresh token: null = no lo toques
      p_refresh_token: nuevo.refresh_token ?? null,
      p_cuenta_email: null,
    })

    return nuevo.access_token
  } catch (e) {
    if (e instanceof ErrorGoogle && e.reconectar) {
      await admin.rpc('google_marcar_reconexion_necesaria', { p_psicologa_id: psicologaId })
    }
    throw e
  }
}
