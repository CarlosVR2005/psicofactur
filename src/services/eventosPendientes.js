import { supabase } from '../lib/supabase'
import { ejecutar, exito, psicologaActualId } from './base'

/* ================================================================
   EVENTOS DE GOOGLE POR REVISAR — tabla `eventos_google_pendientes`

   La bandeja de la importación. Cuando la Edge Function se trae un
   evento del calendario y NO puede saber de quién es —porque el título
   no lleva teléfono ni es una reserva con nombre— no se inventa nada:
   deja la fila aquí para que ella lo resuelva.

   Dos salidas, y las dos las decide ella:
     · «es una cita de X»  -> se crea la cita enlazada al evento
     · «no es una cita»    -> se marca ignorado y no vuelve a aparecer

   Las filas NO se borran nunca. Si se borraran, la siguiente
   sincronización volvería a traerse el mismo evento y ella tendría que
   descartarlo otra vez, para siempre.
   ================================================================ */

const COLUMNAS =
  'id, google_event_id, titulo, inicio, duracion_minutos, nombre_detectado, telefono_detectado'

function deFila(fila) {
  const f = new Date(fila.inicio)
  const dos = (n) => String(n).padStart(2, '0')
  return {
    id: fila.id,
    googleEventId: fila.google_event_id,
    titulo: fila.titulo,
    inicio: fila.inicio,
    fecha: `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`,
    hora: `${dos(f.getHours())}:${dos(f.getMinutes())}`,
    duracion: fila.duracion_minutos,
    // Lo que la importación creyó leer en el título, como propuesta
    nombreDetectado: fila.nombre_detectado ?? '',
    telefonoDetectado: fila.telefono_detectado ?? '',
  }
}

/** Los que están esperando una respuesta, del más próximo al más lejano */
export async function getEventosPendientes() {
  const { data, error } = await ejecutar(
    supabase
      .from('eventos_google_pendientes')
      .select(COLUMNAS)
      .eq('estado', 'pendiente')
      .order('inicio'),
    'cargar los eventos por revisar',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/** Cuántos quedan, para el aviso del calendario */
export async function contarEventosPendientes() {
  const { count, error } = await supabase
    .from('eventos_google_pendientes')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')

  if (error) return exito(0) // un contador no puede romper una pantalla
  return exito(count ?? 0)
}

/** No era una cita. No vuelve a preguntarse por este evento. */
export async function ignorarEvento(evento) {
  const { error } = await ejecutar(
    supabase
      .from('eventos_google_pendientes')
      .update({ estado: 'ignorado' })
      .eq('id', evento.id),
    'descartar el evento',
  )
  if (error) return { data: null, error }
  return exito(evento.id)
}

/**
 * Sí era una cita: se crea enlazada al evento de Google.
 *
 * El `google_event_id` es lo que hace que a partir de ahora las dos
 * agendas vayan juntas: si ella mueve ese evento en Google, la cita se
 * mueve; si la borra, la cita se cancela.
 */
export async function convertirEnCita(evento, pacienteId) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return { data: null, error: { mensaje: 'La sesión ha caducado. Vuelve a entrar.' } }
  }

  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .insert({
        psicologa_id: psicologaId,
        paciente_id: pacienteId,
        fecha_hora: new Date(evento.inicio).toISOString(),
        duracion_minutos: evento.duracion,
        tipo: 'individual',
        google_event_id: evento.googleEventId,
      })
      .select('id')
      .single(),
    'crear la cita',
  )
  if (error) return { data: null, error }

  /* Marcar el evento DESPUÉS de que la cita exista. Al revés, un fallo
     al crear la cita dejaría el evento dado por resuelto y la cita se
     habría perdido sin que nadie se enterase. */
  await supabase
    .from('eventos_google_pendientes')
    .update({ estado: 'resuelto' })
    .eq('id', evento.id)

  return exito(data.id)
}
