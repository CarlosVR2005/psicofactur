import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo, psicologaActualId } from './base'

/* ================================================================
   HISTORIA CLÍNICA — tablas `historia_entradas` y `historia_adjuntos`
   (migración 0027)

   Una entrada por sesión o hito asistencial, en orden cronológico, y
   los documentos que cuelgan de cada una. El texto va en la base; el
   binario de cada adjunto vive en el bucket privado `historia`, y aquí
   sólo se guarda su ruta y sus metadatos.

   Mismo contrato que el resto de `services/*`: `{ data, error }`, nunca
   una excepción. La traducción snake_case ⇄ camelCase vive aquí.

   Al borrar, SIEMPRE se limpia Storage antes que la fila: si el orden
   fuera el contrario y algo fallara por el medio, quedaría un fichero
   sin dueño y sin forma de encontrarlo.
   ================================================================ */

const BUCKET = 'historia'

const COLUMNAS_ENTRADA =
  'id, paciente_id, fecha, titulo, texto, cita_id, created_at, updated_at'
const COLUMNAS_ADJUNTO =
  'id, entrada_id, paciente_id, ruta, nombre, tipo_mime, tamano, created_at'
const ENTRADA_CON_ADJUNTOS = `${COLUMNAS_ENTRADA}, historia_adjuntos (${COLUMNAS_ADJUNTO})`

function adjuntoDeFila(fila) {
  return {
    id: fila.id,
    entradaId: fila.entrada_id,
    pacienteId: fila.paciente_id,
    ruta: fila.ruta,
    nombre: fila.nombre ?? 'documento',
    tipoMime: fila.tipo_mime ?? '',
    tamano: Number(fila.tamano ?? 0),
    creadoEn: fila.created_at,
  }
}

function entradaDeFila(fila) {
  const adjuntos = Array.isArray(fila.historia_adjuntos)
    ? fila.historia_adjuntos
        .map(adjuntoDeFila)
        .sort((a, b) => String(a.creadoEn).localeCompare(String(b.creadoEn)))
    : []
  return {
    id: fila.id,
    pacienteId: fila.paciente_id,
    fecha: fila.fecha ?? '',
    titulo: fila.titulo ?? '',
    texto: fila.texto ?? '',
    citaId: fila.cita_id ?? null,
    creadoEn: fila.created_at,
    actualizadoEn: fila.updated_at,
    adjuntos,
  }
}

/** Objeto de la interfaz -> fila de la base */
function aFila(datos) {
  const oNulo = (v) => (v === '' || v === undefined || v === null ? null : v)
  return {
    fecha: oNulo(datos.fecha),
    titulo: datos.titulo?.trim(),
    texto: oNulo(datos.texto?.trim()),
    cita_id: datos.citaId ?? null,
  }
}

/* ----------------------------------------------------------------
   Entradas
   ---------------------------------------------------------------- */

/** Toda la historia de un paciente, de la más reciente a la más antigua. */
export async function getEntradas(pacienteId) {
  const { data, error } = await ejecutar(
    supabase
      .from('historia_entradas')
      .select(ENTRADA_CON_ADJUNTOS)
      .eq('paciente_id', pacienteId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false }),
    'cargar la historia clínica',
  )
  if (error) return { data: null, error }
  return exito(data.map(entradaDeFila))
}

/** Alta de una entrada. `psicologa_id` sale de la sesión, nunca del formulario. */
export async function crearEntrada(pacienteId, datos) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(
      new Error('sin sesión'),
      'guardar la entrada: la sesión ha caducado',
    )
  }

  const { data, error } = await ejecutar(
    supabase
      .from('historia_entradas')
      .insert({
        ...aFila(datos),
        paciente_id: pacienteId,
        psicologa_id: psicologaId,
      })
      .select(ENTRADA_CON_ADJUNTOS)
      .single(),
    'guardar la entrada de la historia',
  )
  if (error) return { data: null, error }
  return exito(entradaDeFila(data))
}

/** Modificación del texto, el título o la fecha de una entrada. */
export async function actualizarEntrada(id, datos) {
  const { data, error } = await ejecutar(
    supabase
      .from('historia_entradas')
      .update(aFila(datos))
      .eq('id', id)
      .select(ENTRADA_CON_ADJUNTOS)
      .single(),
    'guardar los cambios de la entrada',
  )
  if (error) return { data: null, error }
  return exito(entradaDeFila(data))
}

/**
 * Borra una entrada y todos sus documentos. Primero los ficheros de
 * Storage, después la fila (que se lleva por cascada los metadatos de
 * los adjuntos). Un fallo al limpiar Storage no bloquea el borrado: el
 * objetivo es que la entrada desaparezca.
 *
 * @param entrada la entrada completa, con su array `adjuntos`
 */
export async function eliminarEntrada(entrada) {
  const rutas = (entrada.adjuntos ?? []).map((a) => a.ruta).filter(Boolean)
  if (rutas.length) {
    const { error: errStorage } = await supabase.storage.from(BUCKET).remove(rutas)
    if (errStorage) {
      console.error(
        '[Psicofactur] limpiar los documentos de la entrada:',
        errStorage,
      )
    }
  }

  const { error } = await ejecutar(
    supabase.from('historia_entradas').delete().eq('id', entrada.id),
    'eliminar la entrada de la historia',
  )
  if (error) return { data: null, error }
  return exito(entrada.id)
}

/* ----------------------------------------------------------------
   Adjuntos
   ---------------------------------------------------------------- */

const EXT_POR_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'text/plain': 'txt',
}

const MIME_POR_EXT = Object.fromEntries(
  Object.entries(EXT_POR_MIME).map(([mime, ext]) => [ext, mime]),
)

function extensionDe(nombre, tipoMime) {
  const punto = nombre.lastIndexOf('.')
  if (punto > 0 && punto < nombre.length - 1) {
    const ext = nombre.slice(punto + 1).toLowerCase()
    return ext === 'jpeg' ? 'jpg' : ext
  }
  return EXT_POR_MIME[tipoMime] || 'bin'
}

/* El bucket sólo admite ciertos MIME. Algunos navegadores dejan
   `File.type` vacío (típico con .heic del iPhone); en ese caso se
   deduce del tipo del fichero para que Storage no lo rechace. */
function tipoMimeDe(archivo, ext) {
  if (archivo.type) return archivo.type
  return MIME_POR_EXT[ext] || undefined
}

/**
 * Sube un fichero y guarda su metadato. La ruta es
 * `{psicologa_id}/{paciente_id}/{uuid}.{ext}`: el uuid evita colisiones
 * y mantiene el nombre original —que puede llevar el nombre del
 * paciente— fuera de la ruta.
 *
 * @param entrada  la entrada a la que se adjunta (necesita `id` y `pacienteId`)
 * @param archivo  un File del <input type="file">
 */
export async function subirAdjunto(entrada, archivo) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(
      new Error('sin sesión'),
      'subir el documento: la sesión ha caducado',
    )
  }

  const ext = extensionDe(archivo.name, archivo.type)
  const ruta = `${psicologaId}/${entrada.pacienteId}/${crypto.randomUUID()}.${ext}`

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, archivo, {
      contentType: tipoMimeDe(archivo, ext),
      upsert: false,
    })
  if (errSubida) return fallo(errSubida, 'subir el documento')

  const { data, error } = await ejecutar(
    supabase
      .from('historia_adjuntos')
      .insert({
        entrada_id: entrada.id,
        paciente_id: entrada.pacienteId,
        psicologa_id: psicologaId,
        ruta,
        nombre: archivo.name,
        tipo_mime: tipoMimeDe(archivo, ext) ?? null,
        tamano: archivo.size ?? null,
      })
      .select(COLUMNAS_ADJUNTO)
      .single(),
    'guardar el documento',
  )
  if (error) {
    // El fichero está subido pero el metadato no: sin fila que lo
    // enlace es un huérfano. Se quita para no dejar rastro.
    await supabase.storage.from(BUCKET).remove([ruta])
    return { data: null, error }
  }
  return exito(adjuntoDeFila(data))
}

/** Borra un documento: el fichero y luego su fila. */
export async function eliminarAdjunto(adjunto) {
  const { error: errStorage } = await supabase.storage
    .from(BUCKET)
    .remove([adjunto.ruta])
  if (errStorage) {
    console.error('[Psicofactur] borrar el documento de la historia:', errStorage)
  }

  const { error } = await ejecutar(
    supabase.from('historia_adjuntos').delete().eq('id', adjunto.id),
    'borrar el documento',
  )
  if (error) return { data: null, error }
  return exito(adjunto.id)
}

/**
 * Enlace de descarga de un minuto para un documento. El bucket es
 * privado: no hay URL permanente, y eso es lo que se quiere para un
 * dato de salud.
 */
export async function urlFirmadaAdjunto(adjunto) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(adjunto.ruta, 60, { download: adjunto.nombre })
  if (error) return fallo(error, 'preparar la descarga del documento')
  return exito(data.signedUrl)
}

/* ----------------------------------------------------------------
   Para el borrado de paciente (services/pacientes.js)

   La cascada de Postgres se lleva las filas, pero NO los ficheros de
   Storage. Hay que leer las rutas antes de borrar la ficha y limpiarlas
   a mano después.
   ---------------------------------------------------------------- */

/** Las rutas de Storage de todos los documentos de la historia de un paciente. */
export async function rutasAdjuntosDePaciente(pacienteId) {
  const { data, error } = await ejecutar(
    supabase.from('historia_adjuntos').select('ruta').eq('paciente_id', pacienteId),
    'consultar los documentos de la historia',
  )
  if (error) return { data: null, error }
  return exito(data.map((f) => f.ruta).filter(Boolean))
}

/** Borra de Storage una lista de rutas. Tolera la lista vacía. */
export async function borrarAdjuntosEnStorage(rutas) {
  if (!rutas?.length) return exito(null)
  const { error } = await supabase.storage.from(BUCKET).remove(rutas)
  if (error) return fallo(error, 'limpiar los documentos de la historia')
  return exito(null)
}
