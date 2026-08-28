/* ================================================================
   CSV — leer y escribir

   El CSV es el único formato que hablan todos los programas: Excel,
   Google Contactos, las agendas de las mutuas y cualquier gestor de
   consultas del que se quiera salir. No hace falta ninguna librería
   para leerlo bien, sólo tener en cuenta las cuatro trampas de siempre:

     · El separador NO siempre es la coma. Un Excel en español exporta
       con punto y coma, porque la coma ya se usa para los decimales.
       Aquí se detecta mirando la primera línea.
     · Un campo entre comillas puede contener el separador y hasta
       saltos de línea (una observación de dos párrafos, por ejemplo).
     · Windows termina las líneas con \r\n.
     · Excel sólo abre bien un CSV en UTF-8 si empieza por el BOM. Sin
       él, «Lucía» se ve como «LucÃ­a».
   ================================================================ */

const BOM = '\ufeff'
const CANDIDATOS = [';', ',', '\t', '|']

/**
 * Qué carácter separa las columnas. Se cuenta cada candidato en la
 * primera línea con contenido, sin mirar dentro de las comillas.
 */
export function detectarSeparador(texto) {
  const primera = primeraLinea(texto)

  let mejor = ';'
  let masVeces = 0
  for (const sep of CANDIDATOS) {
    const veces = contarFuera(primera, sep)
    if (veces > masVeces) {
      mejor = sep
      masVeces = veces
    }
  }
  return mejor
}

function primeraLinea(texto) {
  let linea = ''
  let enComillas = false
  for (const c of texto.replace(BOM, '')) {
    if (c === '"') enComillas = !enComillas
    else if (c === '\n' && !enComillas) {
      if (linea.trim()) break
      linea = ''
      continue
    }
    linea += c
  }
  return linea
}

function contarFuera(linea, sep) {
  let veces = 0
  let enComillas = false
  for (const c of linea) {
    if (c === '"') enComillas = !enComillas
    else if (c === sep && !enComillas) veces += 1
  }
  return veces
}

/**
 * Texto de un CSV -> { separador, cabeceras, filas }
 *
 * `cabeceras` es la primera línea y `filas` son arrays de strings, ya
 * sin comillas y con el mismo número de columnas que la cabecera (se
 * rellena con '' lo que falte: hay programas que se ahorran las
 * últimas columnas cuando están vacías).
 */
export function leerCsv(texto) {
  const separador = detectarSeparador(texto)
  const todas = partirEnFilas(texto.replace(BOM, ''), separador)

  if (todas.length === 0) return { separador, cabeceras: [], filas: [] }

  const cabeceras = todas[0].map((c) => c.trim())
  const filas = todas.slice(1).map((fila) => {
    const ajustada = cabeceras.map((_, i) => (fila[i] ?? '').trim())
    return ajustada
  })

  return { separador, cabeceras, filas }
}

function partirEnFilas(texto, separador) {
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i]

    if (enComillas) {
      if (c === '"') {
        // Dos comillas seguidas dentro de un campo son una comilla real
        if (texto[i + 1] === '"') {
          campo += '"'
          i += 1
        } else {
          enComillas = false
        }
      } else {
        campo += c
      }
      continue
    }

    if (c === '"') enComillas = true
    else if (c === separador) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else if (c !== '\r') {
      campo += c
    }
  }

  fila.push(campo)
  filas.push(fila)

  // Las líneas en blanco del final no son pacientes
  return filas.filter((f) => f.some((v) => v.trim() !== ''))
}

/** Cabeceras + filas -> texto CSV listo para guardar */
export function generarCsv(cabeceras, filas, separador = ';') {
  const escapar = (valor) => {
    const texto = valor === null || valor === undefined ? '' : String(valor)
    const necesitaComillas =
      texto.includes(separador) ||
      texto.includes('"') ||
      texto.includes('\n') ||
      texto.includes('\r')
    return necesitaComillas ? `"${texto.replace(/"/g, '""')}"` : texto
  }

  const lineas = [cabeceras, ...filas].map((fila) => fila.map(escapar).join(separador))
  // BOM al principio y saltos de Windows: así Excel lo abre bien de un doble clic
  return BOM + lineas.join('\r\n') + '\r\n'
}

/** Provoca la descarga de un archivo generado en el navegador */
export function descargarTexto(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Sin esto el blob se queda en memoria hasta recargar la página
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Bytes -> texto, adivinando la codificación.
 *
 * Los programas antiguos de Windows exportan en ANSI (windows-1252) y
 * no en UTF-8. Si se descodifica mal, el navegador mete el carácter de
 * reemplazo (�): en cuanto aparece uno, se vuelve a intentar.
 */
export function decodificarTexto(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('�')) return utf8
  return new TextDecoder('windows-1252').decode(bytes)
}
