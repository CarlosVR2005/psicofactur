/* ================================================================
   Reducir una imagen antes de subirla a la historia clínica.

   La mayoría son fotos de informes, pruebas o escritos del colegio
   hechas con el móvil: una foto de 12-15 MP puede pesar 10-15 MB y no
   hace falta ni de lejos tanto para que se lea. Se baja a 2400 px de
   lado mayor y se reencoda como JPEG; una foto de 15 MB queda por
   debajo de 1 MB sin perder legibilidad.

   Sólo se tocan los formatos que el navegador sabe redibujar en un
   canvas: JPEG, PNG, WebP y HEIC/HEIF *si el sistema lo decodifica*
   (iPhone y Mac sí; Chrome en Windows no). Si algo falla —formato que
   no decodifica, canvas vacío— se devuelve el fichero original tal
   cual y que decida quien llama. Esta función NUNCA lanza.
   ================================================================ */

const LADO_MAX = 2400 // px del lado mayor
const CALIDAD = 0.82 // 0-1 para el JPEG de salida
// Si ya cabe en el lado máximo y no pesa más que esto, se deja igual
const LIMITE_SIN_TOCAR = 1.5 * 1024 * 1024

const COMPRIMIBLES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const MIME_POR_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

/* `File.type` viene vacío a veces con los .heic del iPhone: se deduce
   de la extensión para saber si es una imagen que podemos tratar. */
function tipoDe(archivo) {
  if (archivo.type) return archivo.type.toLowerCase()
  const ext = archivo.name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_POR_EXT[ext] ?? ''
}

/**
 * @param   {File} archivo  el fichero elegido en el <input type="file">
 * @returns {Promise<File>} el mismo fichero, o uno más ligero
 */
export async function comprimirImagen(archivo) {
  if (!COMPRIMIBLES.has(tipoDe(archivo))) return archivo

  let bitmap
  try {
    bitmap = await createImageBitmap(archivo)
  } catch {
    return archivo // el navegador no sabe decodificarla (HEIC fuera de Apple)
  }

  const ladoMayor = Math.max(bitmap.width, bitmap.height)
  const escala = ladoMayor > LADO_MAX ? LADO_MAX / ladoMayor : 1

  // Ni sobredimensionada ni pesada: no merece la pena tocarla
  if (escala === 1 && archivo.size <= LIMITE_SIN_TOCAR) {
    bitmap.close?.()
    return archivo
  }

  const ancho = Math.round(bitmap.width * escala)
  const alto = Math.round(bitmap.height * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    return archivo
  }
  // Fondo blanco: un PNG con transparencia queda legible al pasar a JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close?.()

  const blob = await new Promise((resolver) =>
    lienzo.toBlob(resolver, 'image/jpeg', CALIDAD),
  )
  // Sin blob, o no ha mejorado: se queda el original
  if (!blob || blob.size >= archivo.size) return archivo

  const nombre = archivo.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], nombre, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
