/* ================================================================
   sync-cita-a-google

   Refleja una cita en Google Calendar: crear, actualizar o borrar.

   La llama el navegador justo después de guardar en Supabase (ver
   `services/citas.js`), no un trigger de base de datos. A propósito:
   con un trigger, el día que la sincronización Google -> app escriba en
   `citas` se montaría un bucle (la app avisa a Google, Google avisa a la
   app, la app avisa a Google…). Disparando desde el navegador sólo se
   sincroniza lo que se toca a mano, y el fallo se ve en pantalla en vez
   de morirse en un log.

   Del navegador sólo se acepta QUÉ cita y QUÉ acción. El contenido del
   evento se saca de la base de datos, con el RLS de la usuaria puesto:
   así nadie puede fabricar un evento con datos inventados.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin, clienteDeUsuaria, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import { accessTokenValido, ErrorGoogle } from '../_shared/google.ts'

const API = 'https://www.googleapis.com/calendar/v3'

const ETIQUETA_TIPO: Record<string, string> = {
  individual: 'Sesión',
  pareja: 'Sesión de pareja',
  online: 'Sesión online',
}

const COLUMNAS = `
  id, fecha_hora, duracion_minutos, tipo, notas, google_event_id,
  paciente:pacientes!citas_paciente_id_fkey (nombre),
  acompanante:pacientes!citas_acompanante_id_fkey (nombre)
`

interface Config {
  mostrarNombre?: boolean
  calendarId?: string
  zonaHoraria?: string
}

/** La cita, tal y como la ve Google. */
function aEvento(cita: any, config: Config, citaId: string) {
  const inicio = new Date(cita.fecha_hora)
  const fin = new Date(inicio.getTime() + Number(cita.duracion_minutos ?? 50) * 60000)
  const zona = config.zonaHoraria || 'Europe/Madrid'

  // Privacidad: se puede sincronizar sin el nombre del paciente
  const conNombre = config.mostrarNombre !== false
  const quien = cita.acompanante?.nombre
    ? `${cita.paciente?.nombre} y ${cita.acompanante.nombre}`
    : (cita.paciente?.nombre ?? 'Paciente')
  const tipo = ETIQUETA_TIPO[cita.tipo] ?? 'Sesión'

  return {
    summary: conNombre ? `${tipo} · ${quien}` : tipo,
    description: [cita.notas, 'Creado desde Psicofactur'].filter(Boolean).join('\n\n'),
    start: { dateTime: inicio.toISOString(), timeZone: zona },
    end: { dateTime: fin.toISOString(), timeZone: zona },
    // Marca invisible en el evento: sirve para reconocerlo cuando la
    // sincronización vaya también de Google hacia la app.
    extendedProperties: { private: { psicofacturCitaId: citaId } },
    // Sin invitados a propósito: al paciente no le llega nada de Google
  }
}

async function llamarGoogle(token: string, ruta: string, opciones: RequestInit = {}) {
  const r = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opciones.headers ?? {}),
    },
  })

  if (r.status === 204) return { datos: null, estado: 204 }
  const datos = await r.json().catch(() => null)
  if (!r.ok) {
    // 404/410 = el evento ya no está en Google (lo borró ella a mano).
    // No es un fallo: lo trata quien llama.
    if (r.status !== 404 && r.status !== 410) {
      console.error('[Psicofactur] Google Calendar respondió', r.status, datos)
    }
    return { datos, estado: r.status }
  }
  return { datos, estado: r.status }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const psicologaId = await psicologaDeLaPeticion(req)
  if (!psicologaId) return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)

  const cuerpo = await req.json().catch(() => ({}))
  const accion = String(cuerpo.accion ?? '')
  const citaId = cuerpo.citaId ? String(cuerpo.citaId) : null

  if (!['crear', 'actualizar', 'borrar'].includes(accion)) {
    return json({ mensaje: 'Acción no válida.' }, 400)
  }

  const usuaria = clienteDeUsuaria(req)
  const admin = clienteAdmin()

  // Preferencias de la psicóloga (con su RLS: sólo ve su propia fila)
  const { data: fila } = await usuaria
    .from('psicologas')
    .select('google_calendar_config')
    .eq('id', psicologaId)
    .single()

  const config: Config = fila?.google_calendar_config ?? {}
  const calendario = encodeURIComponent(config.calendarId || 'primary')

  let token: string
  try {
    token = await accessTokenValido(admin, psicologaId)
  } catch (e) {
    // `accessTokenValido` ya ha dejado marcado `necesitaReconectar` si
    // hacía falta; aquí sólo hay que contarlo bien.
    const esGoogle = e instanceof ErrorGoogle
    return json(
      {
        googleEventId: null,
        aviso: esGoogle ? e.message : 'No se ha podido hablar con Google Calendar.',
        reconectar: esGoogle ? e.reconectar : false,
      },
      200,
    )
  }

  /* ---------------------------- Borrar ----------------------------
     La fila de `citas` ya no existe cuando llegamos aquí (Supabase es la
     fuente de verdad y se borra primero), así que el id del evento lo
     manda el navegador. No es un agujero: el token es el de ella, así
     que como mucho podría borrar un evento de su propio calendario. */
  if (accion === 'borrar') {
    const eventoId = cuerpo.googleEventId ? String(cuerpo.googleEventId) : null
    if (!eventoId) return json({ googleEventId: null, aviso: null })

    const { estado } = await llamarGoogle(
      token,
      `/calendars/${calendario}/events/${encodeURIComponent(eventoId)}`,
      { method: 'DELETE' },
    )

    // 404/410: ya no estaba. El objetivo era que no estuviera: hecho.
    const bien = estado === 204 || estado === 200 || estado === 404 || estado === 410
    return json({
      googleEventId: null,
      aviso: bien ? null : 'Google Calendar no ha podido borrar el evento.',
    })
  }

  /* ---------------------- Crear y actualizar ---------------------- */
  if (!citaId) return json({ mensaje: 'Falta la cita.' }, 400)

  const { data: cita, error: errorCita } = await usuaria
    .from('citas')
    .select(COLUMNAS)
    .eq('id', citaId)
    .single()

  if (errorCita || !cita) {
    console.error('[Psicofactur] no se ha podido leer la cita:', errorCita)
    return json({ googleEventId: null, aviso: 'No se ha podido leer la cita.' })
  }

  const evento = JSON.stringify(aEvento(cita, config, citaId))
  const eventoId = cita.google_event_id

  // Si ya tiene evento, se actualiza
  if (eventoId) {
    const { datos, estado } = await llamarGoogle(
      token,
      `/calendars/${calendario}/events/${encodeURIComponent(eventoId)}`,
      { method: 'PATCH', body: evento },
    )

    if (estado === 200) return json({ googleEventId: datos?.id ?? eventoId, aviso: null })

    // Si ella borró el evento en Google, se crea uno nuevo en vez de
    // dejar la cita desincronizada para siempre.
    if (estado !== 404 && estado !== 410) {
      return json({
        googleEventId: eventoId,
        aviso: 'Google Calendar no ha aceptado el cambio.',
      })
    }
  }

  const { datos, estado } = await llamarGoogle(token, `/calendars/${calendario}/events`, {
    method: 'POST',
    body: evento,
  })

  if (estado !== 200 || !datos?.id) {
    return json({ googleEventId: null, aviso: 'Google Calendar no ha podido crear el evento.' })
  }

  // Lo guarda el servidor, que es quien acaba de hablar con Google
  const { error: errorGuardar } = await usuaria
    .from('citas')
    .update({ google_event_id: datos.id })
    .eq('id', citaId)

  if (errorGuardar) {
    console.error('[Psicofactur] no se ha podido guardar el google_event_id:', errorGuardar)
  }

  return json({ googleEventId: datos.id, aviso: null })
})
