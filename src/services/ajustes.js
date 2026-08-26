import { supabase } from '../lib/supabase'
import { horarioVacio } from '../lib/espera'
import { ejecutar, exito, psicologaActualId } from './base'

/* Ajustes de la consulta que viven en la fila de `psicologas`.
   Google Calendar y WhatsApp; Veri*Factu tiene ya su propio JSONB
   esperando en la misma tabla.

   En `google_calendar_config` está SÓLO el estado visible. Los tokens
   no: viven en `google_credenciales`, que el navegador ni siquiera
   puede consultar, cifrados con Vault (ver migración 0004). */

const POR_DEFECTO = {
  conectado: false,
  email: null,
  conectadoEn: null,
  // Google ha retirado el permiso y hace falta volver a autorizar
  necesitaReconectar: false,
  calendarId: 'primary',
  // Privacidad: se puede sincronizar sin el nombre del paciente
  mostrarNombre: true,
}

/* Sólo estas claves las decide la pantalla. Las demás (conectado, email,
   necesitaReconectar) las escribe el servidor y el navegador no las
   puede pisar por accidente. */
const PREFERENCIAS = ['mostrarNombre', 'calendarId']

// Se consulta en cada alta o cambio de cita: se guarda en memoria para
// no ir a la base cada vez.
let cache = null

/** Configuración de Google Calendar de la psicóloga con sesión abierta */
export async function getConfigGoogle({ refrescar = false } = {}) {
  if (cache && !refrescar) return exito(cache)

  const id = await psicologaActualId()
  if (!id) return exito(POR_DEFECTO)

  const { data, error } = await ejecutar(
    supabase.from('psicologas').select('google_calendar_config').eq('id', id).single(),
    'cargar los ajustes de Google Calendar',
  )
  if (error) return { data: null, error }
  cache = { ...POR_DEFECTO, ...(data.google_calendar_config ?? {}) }
  return exito(cache)
}

/**
 * Guarda las preferencias de la pantalla (si se incluye el nombre del
 * paciente en el evento, qué calendario…).
 *
 * Lee antes lo que hay en la base para no machacar lo que haya escrito
 * el servidor mientras tanto: la conexión la conceden y la retiran las
 * Edge Functions, no esta pantalla.
 */
export async function guardarPreferenciasGoogle(preferencias) {
  const id = await psicologaActualId()
  if (!id) return exito({ ...POR_DEFECTO, ...preferencias })

  const { data: actual, error: errorLeer } = await getConfigGoogle({ refrescar: true })
  if (errorLeer) return { data: null, error: errorLeer }

  const config = { ...actual }
  for (const clave of PREFERENCIAS) {
    if (clave in preferencias) config[clave] = preferencias[clave]
  }

  const { data, error } = await ejecutar(
    supabase
      .from('psicologas')
      .update({ google_calendar_config: config })
      .eq('id', id)
      .select('google_calendar_config')
      .single(),
    'guardar los ajustes de Google Calendar',
  )
  if (error) return { data: null, error }
  cache = { ...POR_DEFECTO, ...(data.google_calendar_config ?? {}) }
  return exito(cache)
}

/** Olvida lo que hay en memoria: tras conectar o desconectar. */
export function olvidarConfigGoogle() {
  cache = null
}


/* ================================================================
   WHATSAPP BUSINESS

   Mismo criterio que con Google: aquí sólo el estado visible. El token
   de Meta no está en esta tabla ni en ninguna otra, es un secreto de
   las Edge Functions.
   ================================================================ */

const WHATSAPP_POR_DEFECTO = {
  // false = el botón Enviar abre WhatsApp para mandarlo a mano
  activo: false,
  plantilla: 'recordatorio_cita',
  idioma: 'es',
  // Antelación del envío automático, en horas
  horasAntes: 24,
  // Contestar al paciente cuando pulsa un botón
  acuse: true,
}

const PREFERENCIAS_WHATSAPP = ['activo', 'plantilla', 'idioma', 'horasAntes', 'acuse']

let cacheWhatsapp = null

/** Configuración de WhatsApp de la psicóloga con sesión abierta */
export async function getConfigWhatsApp({ refrescar = false } = {}) {
  if (cacheWhatsapp && !refrescar) return exito(cacheWhatsapp)

  const id = await psicologaActualId()
  if (!id) return exito(WHATSAPP_POR_DEFECTO)

  const { data, error } = await ejecutar(
    supabase.from('psicologas').select('whatsapp_config').eq('id', id).single(),
    'cargar los ajustes de WhatsApp',
  )
  if (error) return { data: null, error }
  cacheWhatsapp = { ...WHATSAPP_POR_DEFECTO, ...(data.whatsapp_config ?? {}) }
  return exito(cacheWhatsapp)
}

export async function guardarPreferenciasWhatsApp(preferencias) {
  const id = await psicologaActualId()
  if (!id) return exito({ ...WHATSAPP_POR_DEFECTO, ...preferencias })

  const { data: actual, error: errorLeer } = await getConfigWhatsApp({ refrescar: true })
  if (errorLeer) return { data: null, error: errorLeer }

  const config = { ...actual }
  for (const clave of PREFERENCIAS_WHATSAPP) {
    if (clave in preferencias) config[clave] = preferencias[clave]
  }

  const { data, error } = await ejecutar(
    supabase
      .from('psicologas')
      .update({ whatsapp_config: config })
      .eq('id', id)
      .select('whatsapp_config')
      .single(),
    'guardar los ajustes de WhatsApp',
  )
  if (error) return { data: null, error }
  cacheWhatsapp = { ...WHATSAPP_POR_DEFECTO, ...(data.whatsapp_config ?? {}) }
  return exito(cacheWhatsapp)
}

export function olvidarConfigWhatsApp() {
  cacheWhatsapp = null
}


/* ================================================================
   HORARIO DE TRABAJO

   Para cuándo trabaja la psicóloga, día a día. Lo usa la lista de
   espera para calcular huecos libres de verdad (ver `lib/espera.js`),
   no sólo los que deja una cita cancelada.

   Sin capas que proteger aquí: a diferencia de Google y WhatsApp, este
   JSONB no lo escribe nadie más que esta pantalla, así que se
   sobrescribe entero al guardar.
   ================================================================ */

let cacheHorario = null

/** Horario de trabajo de la psicóloga con sesión abierta */
export async function getHorarioTrabajo({ refrescar = false } = {}) {
  if (cacheHorario && !refrescar) return exito(cacheHorario)

  const id = await psicologaActualId()
  if (!id) return exito(horarioVacio())

  const { data, error } = await ejecutar(
    supabase.from('psicologas').select('horario_trabajo').eq('id', id).single(),
    'cargar el horario de trabajo',
  )
  if (error) return { data: null, error }
  cacheHorario = { ...horarioVacio(), ...(data.horario_trabajo ?? {}) }
  return exito(cacheHorario)
}

export async function guardarHorarioTrabajo(horario) {
  const id = await psicologaActualId()
  if (!id) return exito(horario)

  const { data, error } = await ejecutar(
    supabase
      .from('psicologas')
      .update({ horario_trabajo: horario })
      .eq('id', id)
      .select('horario_trabajo')
      .single(),
    'guardar el horario de trabajo',
  )
  if (error) return { data: null, error }
  cacheHorario = { ...horarioVacio(), ...(data.horario_trabajo ?? {}) }
  return exito(cacheHorario)
}

export function olvidarHorarioTrabajo() {
  cacheHorario = null
}
