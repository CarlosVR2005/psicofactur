import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo, psicologaActualId } from './base'

/* ================================================================
   PACIENTES — tabla `pacientes`

   La base de datos habla en snake_case (fecha_nacimiento) y la interfaz
   en camelCase (fechaNacimiento). La traducción vive aquí y sólo aquí:
   los componentes nunca ven un nombre de columna.

   No hay borrado físico: archivar = activo -> false. El histórico de
   citas y facturas de un paciente debe seguir existiendo.
   ================================================================ */

/** Fila de la base de datos -> objeto que usa la interfaz */
function deFila(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    dni: fila.dni ?? '',
    telefono: fila.telefono ?? '',
    correo: fila.correo ?? '',
    fechaNacimiento: fila.fecha_nacimiento ?? '',
    precioSesion: Number(fila.precio_sesion ?? 0),
    inicioTerapia: fila.inicio_terapia ?? '',
    observaciones: fila.observaciones ?? '',
    activo: fila.activo,
    creadoEn: fila.created_at,

    /* Consentimiento informado (migración 0018). El trazo de la firma NO
       está aquí: son decenas de KB por paciente y esto se carga para
       toda la lista. Se pide aparte con `getFirmaConsentimiento` cuando
       ella quiere verlo. */
    consentimientoEstado: fila.consentimiento_estado ?? 'NO_ENVIADO',
    consentimientoFechaEnvio: fila.consentimiento_fecha_envio ?? '',
    consentimientoFechaFirma: fila.consentimiento_fecha_firma ?? '',
  }
}

/** Objeto de la interfaz -> fila de la base de datos */
function aFila(datos) {
  // Los campos de fecha vacíos tienen que ir como null: un '' rompe el tipo date
  const oNulo = (v) => (v === '' || v === undefined ? null : v)

  return {
    nombre: datos.nombre?.trim(),
    dni: oNulo(datos.dni?.trim()),
    telefono: oNulo(datos.telefono?.replace(/\s/g, '')),
    correo: oNulo(datos.correo?.trim()),
    fecha_nacimiento: oNulo(datos.fechaNacimiento),
    precio_sesion: Number(datos.precioSesion ?? 0),
    inicio_terapia: oNulo(datos.inicioTerapia),
    observaciones: oNulo(datos.observaciones?.trim()),
  }
}

const COLUMNAS =
  'id, nombre, dni, telefono, correo, fecha_nacimiento, precio_sesion, inicio_terapia, observaciones, activo, created_at, ' +
  'consentimiento_estado, consentimiento_fecha_envio, consentimiento_fecha_firma'

/**
 * Lista de pacientes ordenada por nombre.
 * @param {{ incluirArchivados?: boolean }} opciones
 */
export async function getPacientes({ incluirArchivados = false } = {}) {
  let consulta = supabase.from('pacientes').select(COLUMNAS).order('nombre')
  if (!incluirArchivados) consulta = consulta.eq('activo', true)

  const { data, error } = await ejecutar(consulta, 'cargar los pacientes')
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/** Ficha de un paciente concreto */
export async function getPaciente(id) {
  const { data, error } = await ejecutar(
    supabase.from('pacientes').select(COLUMNAS).eq('id', id).single(),
    'cargar la ficha del paciente',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}

/** Alta de paciente. `psicologa_id` sale de la sesión, nunca del formulario. */
export async function crearPaciente(datos) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(
      new Error('sin sesión'),
      'guardar el paciente: la sesión ha caducado',
    )
  }

  const { data, error } = await ejecutar(
    supabase
      .from('pacientes')
      .insert({ ...aFila(datos), psicologa_id: psicologaId })
      .select(COLUMNAS)
      .single(),
    'crear el paciente',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}

/** Modificación de la ficha */
export async function actualizarPaciente(id, datos) {
  const { data, error } = await ejecutar(
    supabase.from('pacientes').update(aFila(datos)).eq('id', id).select(COLUMNAS).single(),
    'guardar los cambios del paciente',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}

/** Archivar / reactivar (nunca se borra físicamente) */
export async function cambiarActivo(id, activo) {
  const { data, error } = await ejecutar(
    supabase.from('pacientes').update({ activo }).eq('id', id).select(COLUMNAS).single(),
    activo ? 'reactivar el paciente' : 'archivar el paciente',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}
