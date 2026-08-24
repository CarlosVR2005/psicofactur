import { supabase } from '../lib/supabase'
import { fallo } from './base'
import { olvidarConfigGoogle } from './ajustes'

/* ================================================================
   GOOGLE CALENDAR — conexión desde el servidor

   El permiso de Google es INDEPENDIENTE del login: la psicóloga entra
   con su email y contraseña como siempre, y por separado autoriza el
   acceso a su calendario desde Ajustes.

   Aquí no hay tokens. El navegador sólo:
     · pide a la Edge Function la URL de consentimiento y se va a Google,
     · y le dice a otra Edge Function que desconecte.
   Los tokens viven cifrados en el servidor (Vault) y no pasan nunca por
   esta pantalla. El Client Secret tampoco: es un secreto de las Edge
   Functions, no una variable del .env del navegador.

   ESTA SIGUE SIENDO LA COSTURA: `services/citas.js` llama a
   `sincronizarCita()` y no sabe nada de lo que hay detrás.
   ================================================================ */

/** Saca el mensaje que devolvió la Edge Function cuando responde con error. */
async function mensajeDeError(error) {
  try {
    const cuerpo = await error?.context?.json?.()
    if (cuerpo?.mensaje) return cuerpo.mensaje
  } catch (_) {
    // La función ni siquiera respondió JSON
  }
  return null
}

/**
 * Empieza la autorización: pide la URL de consentimiento y manda allí el
 * navegador.
 *
 * Redirección completa, no ventana emergente: en el iPhone, con la app
 * añadida a la pantalla de inicio, los popups se abren fuera de la app y
 * la vuelta se pierde. Google devuelve a `/ajustes?google=ok`.
 *
 * Si todo va bien, esta función NO retorna: la página se va.
 */
export async function conectar() {
  const { data, error } = await supabase.functions.invoke('google-oauth-start', {
    body: { origen: window.location.origin },
  })

  if (error || !data?.url) {
    const mensaje = await mensajeDeError(error)
    return fallo(error ?? new Error('sin url'), 'conectar con Google Calendar', mensaje)
  }

  window.location.href = data.url
  return { data: true, error: null }
}

/** Retira el permiso: se revoca en Google y se borran los tokens. */
export async function desconectar() {
  const { data, error } = await supabase.functions.invoke('google-desconectar')

  if (error) {
    const mensaje = await mensajeDeError(error)
    return fallo(error, 'desconectar Google Calendar', mensaje)
  }
  return { data: data ?? true, error: null }
}

/**
 * Lee el resultado que trae la URL al volver de Google y limpia la
 * dirección, para que al recargar no vuelva a salir el mismo mensaje.
 * @returns {{tipo:'ok'|'error', titulo:string, detalle?:string}|null}
 */
export function leerResultadoConexion() {
  const params = new URLSearchParams(window.location.search)
  const resultado = params.get('google')
  if (!resultado) return null

  window.history.replaceState({}, '', window.location.pathname)

  switch (resultado) {
    case 'ok':
      return { tipo: 'ok', titulo: 'Google Calendar conectado' }
    case 'cancelado':
      return {
        tipo: 'error',
        titulo: 'No se ha dado permiso a Google Calendar',
        detalle: 'Puedes intentarlo otra vez cuando quieras.',
      }
    case 'sin_refresh':
      return {
        tipo: 'error',
        titulo: 'Google no ha dado el permiso permanente',
        detalle: 'Vuelve a intentarlo y acepta todas las casillas de la pantalla de Google.',
      }
    default:
      return {
        tipo: 'error',
        titulo: 'No se ha podido conectar con Google Calendar',
        detalle: 'Inténtalo de nuevo en unos segundos.',
      }
  }
}

/**
 * Trae ahora mismo lo que hay en Google Calendar, sin esperar al sondeo
 * automático de cada 10 minutos.
 *
 * @param {{completa?: boolean}} opciones
 *        completa = olvida por dónde iba y repasa la agenda entera. Es lo
 *        que hace falta la primera vez, para importar lo que ya existía
 *        en el calendario antes de conectar la app.
 * @returns {{data: {actualizados, cancelados, creadas, pendientes, parcial}|null, error}}
 */
export async function traerCambiosDeGoogle({ completa = false } = {}) {
  const { data, error } = await supabase.functions.invoke('sincronizar-desde-google', {
    body: { completa },
  })

  if (error) {
    const mensaje = await mensajeDeError(error)
    return fallo(error, 'traer los cambios de Google Calendar', mensaje)
  }

  if (data?.aviso) {
    olvidarConfigGoogle() // por si el permiso ha dejado de valer
    return { data: null, error: { mensaje: data.aviso, tecnico: data } }
  }

  return {
    data: {
      actualizados: data?.actualizados ?? 0,
      cancelados: data?.cancelados ?? 0,
      creadas: data?.creadas ?? 0,
      pendientes: data?.pendientes ?? 0,
      // Se cortó por el tope: quedan más eventos por traer
      parcial: Boolean(data?.parcial),
    },
    error: null,
  }
}

/* ------------------- Sincronización de citas -------------------

   Se llama justo después de guardar en Supabase. Nunca bloquea: la cita
   ya está guardada, y si Google falla lo único que se devuelve es un
   aviso para la pantalla.

   Al navegador sólo le toca decir QUÉ cita y QUÉ acción; el contenido
   del evento lo arma la Edge Function leyendo la base de datos.        */
export async function sincronizarCita(cita, accion, config = {}) {
  const actual = cita?.googleEventId || null

  // Sin conexión activa no se molesta al servidor
  if (!config.conectado) return { googleEventId: actual, error: null }
  if (accion === 'borrar' && !actual) return { googleEventId: null, error: null }

  const { data, error } = await supabase.functions.invoke('sync-cita-a-google', {
    body: { citaId: cita?.id, accion, googleEventId: actual },
  })

  if (error) {
    const mensaje = await mensajeDeError(error)
    const { error: problema } = fallo(error, 'sincronizar con Google Calendar', mensaje)
    return { googleEventId: actual, error: problema }
  }

  if (data?.aviso) {
    // Google ha retirado el permiso: que Ajustes lo vea al entrar
    if (data.reconectar) olvidarConfigGoogle()
    return {
      googleEventId: data.googleEventId ?? (accion === 'borrar' ? null : actual),
      error: { mensaje: data.aviso, tecnico: data },
    }
  }

  return { googleEventId: data?.googleEventId ?? null, error: null }
}
