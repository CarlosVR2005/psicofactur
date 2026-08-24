/* ================================================================
   Preparar el logo de la consulta para la factura

   Lo que sube alguien desde el móvil suele ser una foto o un PNG
   enorme: 3000 px y varios megas. Eso ni cabe razonablemente en la
   fila de la base ni hace falta para imprimir un logo de cinco
   centímetros.

   Aquí se reescala a un tamaño sensato y se convierte SIEMPRE a PNG,
   que es lo que sabe dibujar el generador del PDF y lo único que
   conserva el fondo transparente —importante en un logo, o saldría
   con un rectángulo blanco encima de la factura.
   ================================================================ */

/* 400x160 da de sobra: en el papel ocupa 50 mm de ancho como mucho, y
   a 300 puntos por pulgada eso son unos 590 px. Nos quedamos algo por
   debajo a cambio de que la fila de la base no engorde. */
const ANCHO_MAXIMO = 400
const ALTO_MAXIMO = 160

/** Lo que aceptamos que suban. El SVG no entra: el PDF no lo dibuja. */
export const FORMATOS_LOGO = ['image/png', 'image/jpeg', 'image/webp']

/* Tope de lo que se acepta ANTES de reescalar. No es por la base —eso
   ya lo resuelve el reescalado— sino para no bloquear el móvil
   decodificando una imagen de 50 megapíxeles. */
const MAXIMO_ORIGEN = 8 * 1024 * 1024

export function errorDeLogo(fichero) {
  if (!fichero) return null
  if (!FORMATOS_LOGO.includes(fichero.type)) {
    return 'El logo tiene que ser una imagen PNG, JPG o WEBP.'
  }
  if (fichero.size > MAXIMO_ORIGEN) {
    return 'Esa imagen es demasiado grande. Prueba con una de menos de 8 MB.'
  }
  return null
}

/**
 * Lee el fichero, lo reescala y devuelve un PNG como `data:` URL.
 *
 * Mantiene la proporción: se ajusta al hueco sin deformarse. Si la
 * imagen ya es pequeña no se agranda, porque estirar un logo pequeño
 * sólo lo pixela.
 *
 * @returns {Promise<{dataUrl: string, ancho: number, alto: number}>}
 */
export async function prepararLogo(fichero) {
  const problema = errorDeLogo(fichero)
  if (problema) throw new Error(problema)

  const imagen = await cargarImagen(fichero)

  const escala = Math.min(
    ANCHO_MAXIMO / imagen.width,
    ALTO_MAXIMO / imagen.height,
    1, // nunca agrandar
  )
  const ancho = Math.max(1, Math.round(imagen.width * escala))
  const alto = Math.max(1, Math.round(imagen.height * escala))

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto

  const ctx = lienzo.getContext('2d')
  // Sin fondo: si el PNG traía transparencia, se conserva
  ctx.drawImage(imagen, 0, 0, ancho, alto)

  return { dataUrl: lienzo.toDataURL('image/png'), ancho, alto }
}

function cargarImagen(fichero) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(fichero)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolver(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rechazar(new Error('No se ha podido leer esa imagen.'))
    }
    img.src = url
  })
}
