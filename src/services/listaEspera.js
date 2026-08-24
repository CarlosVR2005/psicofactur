import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo, psicologaActualId } from './base'

/* ================================================================
   LISTA DE ESPERA — tabla `lista_espera`

   Quién está esperando a que se libere un hueco, para cuándo lo quiere
   y con qué preferencia de horario.

   Los HUECOS LIBERADOS no son una tabla: son las citas futuras que el
   paciente canceló por WhatsApp (`estado_confirmacion = 'cancelada'`).
   Guardarlos aparte sería una copia que se queda vieja en cuanto ella
   mueva o borre esa cita, así que se calculan aquí cada vez.
   ================================================================ */

const COLUMNAS = `
  id, paciente_id, desde, hasta, franja, tipo, nota, estado, cita_id, created_at,
  paciente:pacientes!lista_espera_paciente_id_fkey (id, nombre, telefono)
`

const ACTIVAS = ['esperando', 'avisado']

function deFila(fila) {
  return {
    id: fila.id,
    pacienteId: fila.paciente_id,
    pacienteNombre: fila.paciente?.nombre ?? 'Paciente',
    pacienteTelefono: fila.paciente?.telefono ?? '',
    desde: fila.desde,
    hasta: fila.hasta,
    franja: fila.franja,
    tipo: fila.tipo,
    nota: fila.nota ?? '',
    estado: fila.estado,
    citaId: fila.cita_id,
    // Para ordenar la cola: quien lleva más esperando, primero
    creadaEn: fila.created_at,
  }
}

function aFila(datos) {
  return {
    paciente_id: datos.pacienteId,
    desde: datos.desde,
    hasta: datos.hasta,
    franja: datos.franja,
    tipo: datos.tipo,
    nota: datos.nota?.trim() || null,
  }
}

/** La cola: quien está esperando, del que lleva más tiempo al que menos */
export async function getListaEspera() {
  const { data, error } = await ejecutar(
    supabase
      .from('lista_espera')
      .select(COLUMNAS)
      .in('estado', ACTIVAS)
      .order('created_at'),
    'cargar la lista de espera',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/** Cuántos esperan, para el aviso del calendario */
export async function contarEnEspera() {
  const { count, error } = await supabase
    .from('lista_espera')
    .select('id', { count: 'exact', head: true })
    .in('estado', ACTIVAS)

  if (error) return exito(0) // un contador no puede romper una pantalla
  return exito(count ?? 0)
}

/* ---------------- Huecos liberados ---------------- */

function deFilaHueco(fila) {
  const f = new Date(fila.fecha_hora)
  const dos = (n) => String(n).padStart(2, '0')
  return {
    citaId: fila.id,
    fecha: `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`,
    hora: `${dos(f.getHours())}:${dos(f.getMinutes())}`,
    duracion: fila.duracion_minutos,
    tipo: fila.tipo,
    // De quién era la cita que se canceló
    cancelPor: fila.paciente?.nombre ?? 'Paciente',
  }
}

/** ¿Se pisan estas dos citas? */
function seSolapan(a, b) {
  const iniA = new Date(a.fecha_hora).getTime()
  const finA = iniA + a.duracion_minutos * 60000
  const iniB = new Date(b.fecha_hora).getTime()
  const finB = iniB + b.duracion_minutos * 60000
  return iniA < finB && iniB < finA
}

/**
 * Los huecos que se han liberado y siguen libres.
 *
 * Una cita cancelada deja el hueco libre… salvo que ella ya haya puesto
 * a otra persona a esa misma hora. Por eso no basta con listar las
 * canceladas: hay que descartar las que ya tienen encima una cita viva.
 *
 * @param dias hasta dónde mirar hacia delante
 */
export async function getHuecosLiberados({ dias = 90 } = {}) {
  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  const hasta = new Date(desde)
  hasta.setDate(hasta.getDate() + dias)

  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .select(
        `id, fecha_hora, duracion_minutos, tipo, estado_confirmacion,
         paciente:pacientes!citas_paciente_id_fkey (nombre)`,
      )
      .gte('fecha_hora', desde.toISOString())
      .lte('fecha_hora', hasta.toISOString())
      .order('fecha_hora'),
    'buscar los huecos que se han liberado',
  )
  if (error) return { data: null, error }

  const canceladas = data.filter((c) => c.estado_confirmacion === 'cancelada')
  const enPie = data.filter((c) => c.estado_confirmacion !== 'cancelada')

  return exito(
    canceladas.filter((c) => !enPie.some((o) => seSolapan(c, o))).map(deFilaHueco),
  )
}

/* ---------------- Altas y bajas de la cola ---------------- */

export async function anadirAEspera(datos) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(new Error('sin sesión'), 'apuntar en la lista: la sesión ha caducado')
  }

  const { data, error } = await ejecutar(
    supabase
      .from('lista_espera')
      .insert({ ...aFila(datos), psicologa_id: psicologaId })
      .select(COLUMNAS)
      .single(),
    'apuntar en la lista de espera',
  )

  if (error) {
    // Choque con `lista_espera_paciente_activo`: ya estaba en la cola
    if (error.tecnico?.code === '23505') {
      return {
        data: null,
        error: {
          mensaje: 'Esa persona ya está en la lista de espera. Edita la que tiene.',
          tecnico: error.tecnico,
        },
      }
    }
    return { data: null, error }
  }
  return exito(deFila(data))
}

export async function actualizarEspera(id, datos) {
  const { data, error } = await ejecutar(
    supabase
      .from('lista_espera')
      .update(aFila(datos))
      .eq('id', id)
      .select(COLUMNAS)
      .single(),
    'guardar los cambios de la espera',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}

/**
 * Mueve la espera de estado.
 * @param citaId la cita que se le ha dado, al marcarla como resuelta
 */
export async function cambiarEstadoEspera(id, estado, citaId = null) {
  const { data, error } = await ejecutar(
    supabase
      .from('lista_espera')
      .update({ estado, ...(citaId ? { cita_id: citaId } : {}) })
      .eq('id', id)
      .select(COLUMNAS)
      .single(),
    'cambiar el estado de la espera',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}

/** Se borra de verdad: una espera que ya no toca no es histórico de nada */
export async function quitarDeEspera(id) {
  const { error } = await ejecutar(
    supabase.from('lista_espera').delete().eq('id', id),
    'quitar de la lista de espera',
  )
  if (error) return { data: null, error }
  return exito(id)
}
