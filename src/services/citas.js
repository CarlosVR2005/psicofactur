import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo, psicologaActualId } from './base'
import { sincronizarCita } from './googleCalendar'
import { getConfigGoogle } from './ajustes'

/* ================================================================
   CITAS — tabla `citas`

   La base guarda un único `fecha_hora` (timestamptz); la interfaz
   trabaja con `fecha` ('YYYY-MM-DD') y `hora` ('HH:MM') porque es como
   se piensa una agenda. La conversión vive aquí.

   OJO: `estado_confirmacion` NO se escribe nunca desde el frontend.
   Lo pone el trigger de `recordatorios_whatsapp` cuando el paciente
   responde. Aquí sólo se lee.
   ================================================================ */

// Con dos claves ajenas hacia `pacientes` hay que decirle a PostgREST
// por cuál de las dos tiene que unir cada una.
const COLUMNAS = `
  id, paciente_id, acompanante_id, fecha_hora, duracion_minutos, tipo,
  estado_confirmacion, notas, google_event_id,
  paciente:pacientes!citas_paciente_id_fkey (id, nombre),
  acompanante:pacientes!citas_acompanante_id_fkey (id, nombre)
`

/** timestamptz -> { fecha, hora } en horario local */
function partirFechaHora(iso) {
  const d = new Date(iso)
  const dos = (n) => String(n).padStart(2, '0')
  return {
    fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`,
    hora: `${dos(d.getHours())}:${dos(d.getMinutes())}`,
  }
}

/** { fecha, hora } local -> ISO con la zona horaria del navegador */
function unirFechaHora(fecha, hora) {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, min] = (hora || '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString()
}

function deFila(fila) {
  const { fecha, hora } = partirFechaHora(fila.fecha_hora)
  return {
    id: fila.id,
    pacienteId: fila.paciente_id,
    pacienteNombre: fila.paciente?.nombre ?? 'Paciente',
    acompananteId: fila.acompanante_id,
    acompananteNombre: fila.acompanante?.nombre ?? null,
    fecha,
    hora,
    duracion: fila.duracion_minutos,
    tipo: fila.tipo,
    // Sólo lectura: lo escribe el trigger de WhatsApp
    confirmacion: fila.estado_confirmacion,
    notas: fila.notas ?? '',
    googleEventId: fila.google_event_id ?? '',
  }
}

function aFila(datos) {
  return {
    paciente_id: datos.pacienteId,
    acompanante_id: datos.tipo === 'pareja' ? (datos.acompananteId ?? null) : null,
    fecha_hora: unirFechaHora(datos.fecha, datos.hora),
    duracion_minutos: Number(datos.duracion),
    tipo: datos.tipo,
    notas: datos.notas?.trim() || null,
    // `google_event_id` NO se toca desde aquí. Lo escribe la Edge Function
    // `sync-cita-a-google`, que es quien acaba de hablar con Google. Si se
    // incluyera, cada edición de la cita borraría el vínculo con el evento.
  }
}

/**
 * Citas entre dos fechas, ambas incluidas.
 * @param {string} desde 'YYYY-MM-DD'
 * @param {string} hasta 'YYYY-MM-DD'
 */
export async function getCitas(desde, hasta) {
  const inicio = unirFechaHora(desde, '00:00')
  // Hasta el final del último día
  const [y, m, d] = hasta.split('-').map(Number)
  const fin = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()

  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .select(COLUMNAS)
      .gte('fecha_hora', inicio)
      .lte('fecha_hora', fin)
      .order('fecha_hora'),
    'cargar la agenda',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/** Historial de un paciente (también las citas donde va de acompañante) */
export async function getCitasDePaciente(pacienteId) {
  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .select(COLUMNAS)
      .or(`paciente_id.eq.${pacienteId},acompanante_id.eq.${pacienteId}`)
      .order('fecha_hora', { ascending: false }),
    'cargar las citas del paciente',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/* ---------------- Google Calendar ----------------
   La sincronización cuelga SÓLO de aquí: las pantallas no saben que
   existe. Si Google falla, la cita ya está guardada en Supabase y lo
   único que se devuelve es un aviso, nunca un error que bloquee.       */
async function reflejarEnGoogle(cita, accion) {
  const { data: config } = await getConfigGoogle()
  const { googleEventId, error } = await sincronizarCita(cita, accion, config ?? {})

  // El id del evento ya queda guardado en la base por la Edge Function;
  // aquí sólo se pone al día la cita que se va a devolver a la pantalla.
  if (accion !== 'borrar' && googleEventId) cita.googleEventId = googleEventId

  return error
}

export async function crearCita(datos) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(new Error('sin sesión'), 'crear la cita: la sesión ha caducado')
  }

  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .insert({ ...aFila(datos), psicologa_id: psicologaId })
      .select(COLUMNAS)
      .single(),
    'crear la cita',
  )
  if (error) return { data: null, error }

  const cita = deFila(data)
  const aviso = await reflejarEnGoogle(cita, 'crear')
  return { ...exito(cita), aviso }
}

export async function actualizarCita(id, datos) {
  const { data, error } = await ejecutar(
    supabase.from('citas').update(aFila(datos)).eq('id', id).select(COLUMNAS).single(),
    'guardar los cambios de la cita',
  )
  if (error) return { data: null, error }

  const cita = deFila(data)
  const aviso = await reflejarEnGoogle(cita, 'actualizar')
  return { ...exito(cita), aviso }
}

/** @param cita la cita completa (hace falta su googleEventId para borrarlo también en Google) */
export async function eliminarCita(cita) {
  const { error } = await ejecutar(
    supabase.from('citas').delete().eq('id', cita.id),
    'eliminar la cita',
  )
  if (error) return { data: null, error }

  const aviso = await reflejarEnGoogle(cita, 'borrar')
  return { ...exito(cita.id), aviso }
}

/**
 * Escucha en vivo los cambios de `citas` (Supabase Realtime).
 * Hoy sirve para que la agenda se refresque sola si se toca desde otro
 * dispositivo; mañana será el webhook de WhatsApp cambiando
 * `estado_confirmacion` quien dispare esto.
 * @returns función para darse de baja
 */
let numeroCanal = 0

export function suscribirCitas(alCambiar) {
  // Nombre único por suscripción: varias pantallas pueden escuchar a la vez
  const canal = supabase
    .channel(`citas-en-vivo-${++numeroCanal}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'citas' },
      (payload) => alCambiar(payload),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(canal)
  }
}
