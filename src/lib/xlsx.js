/* ================================================================
   LEER UN .XLSX SIN LIBRERÍAS

   Un archivo de Excel moderno no es un formato binario misterioso: es
   un ZIP con unos cuantos XML dentro.

     xl/workbook.xml            la lista de hojas
     xl/_rels/workbook.xml.rels dónde está el archivo de cada hoja
     xl/worksheets/sheet1.xml   las celdas
     xl/sharedStrings.xml       el texto, guardado una sola vez y
                                referenciado por número
     xl/styles.xml              hace falta para una cosa: saber si un
                                número es en realidad una fecha

   Descomprimir es lo único que parecía necesitar una librería, y el
   navegador ya lo trae: `DecompressionStream('deflate-raw')`. Lo demás
   es leer la cabecera del ZIP (cuatro números) y recorrer el XML.

   Se ha preferido esto a instalar SheetJS por tres razones, en este
   orden:

     · la versión de SheetJS que queda en npm está abandonada y con
       vulnerabilidades conocidas; la buena sólo se distribuye desde su
       propio CDN. En una aplicación con datos de salud eso no compensa,
     · pesa más de 400 KB, más que toda Psicofactur junta,
     · y de un Excel de pacientes hace falta esto: las celdas de la
       primera hoja, como texto. Ni fórmulas, ni gráficos, ni tablas
       dinámicas.

   Lo que NO lee: el `.xls` viejo (formato binario de Excel 97, otra
   cosa completamente distinta) y los archivos con contraseña. Para
   ésos la pantalla pide un CSV.
   ================================================================ */

/**
 * Error cuyo mensaje ya está escrito para leerse en pantalla.
 *
 * Dentro de este archivo se lanzan de los dos tipos: los técnicos
 * («archivo comprimido ilegible») describen el ZIP y no le dicen nada
 * a nadie; los amables explican qué hacer. Quien lo llama sólo enseña
 * los segundos.
 */
export function errorAmable(mensaje) {
  const e = new Error(mensaje)
  e.amable = true
  return e
}

/* ---------------------------------------------------------------
   Reconocer el archivo por dentro, no por la extensión

   Alguien renombra un CSV a .xlsx, o al revés, y el mensaje de error
   sería incomprensible. Los primeros bytes lo dicen sin dudas.
   --------------------------------------------------------------- */

/** Todo ZIP —y por tanto todo .xlsx— empieza por 'PK' */
export function esZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

/** El .xls de Excel 97-2003: un contenedor OLE2, que empieza por D0 CF 11 E0 */
export function esXlsAntiguo(bytes) {
  return (
    bytes.length > 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  )
}

/** ¿Sabe este navegador descomprimir? (Safari, desde iOS 16.4) */
export function sePuedeLeerXlsx() {
  return typeof DecompressionStream === 'function'
}

/* ---------------------------------------------------------------
   1) El ZIP

   Sólo se necesita la parte de lectura, y de ella nada más que dos
   estructuras: el «directorio central» del final, que es el índice, y
   la cabecera local de cada archivo, que dice dónde empiezan sus datos.
   --------------------------------------------------------------- */

const FIN_DIRECTORIO = 0x06054b50
const ENTRADA_DIRECTORIO = 0x02014b50

/**
 * Abre el ZIP y devuelve un índice: nombre -> cómo sacar sus bytes.
 * No se descomprime nada todavía; de un .xlsx sólo interesan cuatro
 * archivos y una hoja de cálculo puede tener muchos más.
 */
function abrirZip(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // El índice está al final, detrás de un comentario de longitud
  // variable, así que se busca su firma hacia atrás.
  let fin = -1
  const hasta = Math.max(0, bytes.length - 22 - 0xffff)
  for (let i = bytes.length - 22; i >= hasta; i -= 1) {
    if (vista.getUint32(i, true) === FIN_DIRECTORIO) {
      fin = i
      break
    }
  }
  if (fin === -1) throw new Error('archivo comprimido ilegible')

  const cuantas = vista.getUint16(fin + 10, true)
  let posicion = vista.getUint32(fin + 16, true)

  if (posicion === 0xffffffff || cuantas === 0xffff) {
    // ZIP64: no lo genera Excel para una lista de pacientes
    throw new Error('archivo comprimido demasiado grande')
  }

  const entradas = new Map()
  const nombres = new TextDecoder('utf-8')

  for (let n = 0; n < cuantas; n += 1) {
    if (vista.getUint32(posicion, true) !== ENTRADA_DIRECTORIO) break

    const metodo = vista.getUint16(posicion + 10, true)
    const comprimido = vista.getUint32(posicion + 20, true)
    const largoNombre = vista.getUint16(posicion + 28, true)
    const largoExtra = vista.getUint16(posicion + 30, true)
    const largoComentario = vista.getUint16(posicion + 32, true)
    const cabeceraLocal = vista.getUint32(posicion + 42, true)

    const nombre = nombres.decode(
      bytes.subarray(posicion + 46, posicion + 46 + largoNombre),
    )

    entradas.set(nombre, { metodo, comprimido, cabeceraLocal })
    posicion += 46 + largoNombre + largoExtra + largoComentario
  }

  return { bytes, vista, entradas }
}

/** Saca un archivo del ZIP ya descomprimido. null si no está. */
async function extraer(zip, nombre) {
  const entrada = zip.entradas.get(nombre)
  if (!entrada) return null

  // La cabecera local repite el nombre y los extras, y su longitud no
  // tiene por qué coincidir con la del índice: hay que leerla de aquí
  const largoNombre = zip.vista.getUint16(entrada.cabeceraLocal + 26, true)
  const largoExtra = zip.vista.getUint16(entrada.cabeceraLocal + 28, true)
  const desde = entrada.cabeceraLocal + 30 + largoNombre + largoExtra
  const datos = zip.bytes.subarray(desde, desde + entrada.comprimido)

  if (entrada.metodo === 0) return datos // guardado sin comprimir
  if (entrada.metodo !== 8) {
    throw new Error('el archivo usa una compresión que no se reconoce')
  }

  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flujo).arrayBuffer())
}

/** Un archivo del ZIP como texto ('' si no existe: casi todos son opcionales) */
async function extraerTexto(zip, nombre) {
  const datos = await extraer(zip, nombre)
  return datos ? new TextDecoder('utf-8').decode(datos) : ''
}

/* ---------------------------------------------------------------
   2) El XML

   Nada de DOMParser: los XML de una hoja de cálculo son planos y
   siempre iguales, y así este archivo se puede probar fuera del
   navegador. Lo único que hay que hacer con cuidado es deshacer las
   entidades, o los apellidos con «&» saldrían como «&amp;».
   --------------------------------------------------------------- */

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function desescapar(texto) {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (entera, cuerpo) => {
    if (cuerpo[0] === '#') {
      const codigo =
        cuerpo[1] === 'x' || cuerpo[1] === 'X'
          ? parseInt(cuerpo.slice(2), 16)
          : parseInt(cuerpo.slice(1), 10)
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : entera
    }
    return ENTIDADES[cuerpo] ?? entera
  })
}

/** Valor de un atributo dentro de una etiqueta ya recortada */
function atributo(etiqueta, nombre) {
  const m = etiqueta.match(new RegExp(`\\s${nombre}\\s*=\\s*"([^"]*)"`))
  return m ? desescapar(m[1]) : null
}

/** Todo el texto de los <t> que haya dentro de un trozo de XML */
function textoDeT(xml) {
  let junto = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)) {
    junto += desescapar(m[1] ?? '')
  }
  return junto
}

/* ---------------------------------------------------------------
   3) Fechas

   Excel guarda las fechas como el número de días desde el 30 de
   diciembre de 1899 (sí, ese día raro: es para arrastrar el error del
   año 1900 que trajo de Lotus 1-2-3). Que 30756 sea «15/03/1984» o el
   número 30756 no está en la celda: está en su ESTILO. Por eso hay
   que leer styles.xml.
   --------------------------------------------------------------- */

/* Los formatos de fecha que Excel trae de fábrica y no escribe en el
   archivo, porque se dan por sabidos */
const FORMATOS_FECHA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function estilosDeFecha(xmlEstilos) {
  // Los formatos personalizados sí vienen escritos: dd/mm/yyyy, etc.
  const personalizados = new Map()
  for (const m of xmlEstilos.matchAll(/<numFmt\b[^>]*\/>/g)) {
    const id = Number(atributo(m[0], 'numFmtId'))
    const codigo = atributo(m[0], 'formatCode') ?? ''
    // Fuera lo entrecomillado y lo que va entre corchetes ([$-409]) para
    // no confundir una letra suelta de un texto con una marca de fecha.
    const limpio = codigo.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
    // Una 'm' sola son minutos; una fecha lleva año o día casi siempre
    personalizados.set(id, /[yd]/i.test(limpio))
  }

  const bloque = xmlEstilos.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!bloque) return []

  return [...bloque[1].matchAll(/<xf\b[^>]*?(?:\/>|>)/g)].map((m) => {
    const id = Number(atributo(m[0], 'numFmtId') ?? 0)
    return FORMATOS_FECHA.has(id) || personalizados.get(id) === true
  })
}

/** 30756 -> '1984-03-15' */
function fechaDeSerie(serie, base1904) {
  const origen = base1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  const f = new Date(origen + Math.round(serie) * 86400000)
  if (Number.isNaN(f.getTime())) return String(serie)
  const y = f.getUTCFullYear()
  const m = String(f.getUTCMonth() + 1).padStart(2, '0')
  const d = String(f.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/* ---------------------------------------------------------------
   4) Las celdas
   --------------------------------------------------------------- */

/** 'AB12' -> 27 (la columna, contando desde 0) */
function columnaDe(referencia) {
  let n = 0
  for (const letra of referencia) {
    const codigo = letra.charCodeAt(0)
    if (codigo < 65 || codigo > 90) break
    n = n * 26 + (codigo - 64)
  }
  return n - 1
}

/** Los decimales de coma flotante dejan rastro: 62.50000000000001 */
function numeroLegible(texto) {
  const n = Number(texto)
  if (!Number.isFinite(n)) return texto
  return String(Math.round(n * 1e10) / 1e10)
}

function valorDeCelda(etiqueta, contenido, { compartidas, fechas, base1904 }) {
  const tipo = atributo(etiqueta, 't') ?? 'n'

  if (tipo === 'inlineStr') return textoDeT(contenido).trim()
  if (tipo === 'e') return '' // #N/A, #¡VALOR!… no es un dato

  const v = contenido.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)
  if (!v) return ''
  const bruto = desescapar(v[1])

  if (tipo === 's') return (compartidas[Number(bruto)] ?? '').trim()
  if (tipo === 'str') return bruto.trim() // resultado de texto de una fórmula
  if (tipo === 'b') return bruto === '1' ? 'Sí' : 'No'

  // Número: puede ser una fecha disfrazada
  const estilo = Number(atributo(etiqueta, 's') ?? -1)
  if (fechas[estilo] && bruto !== '' && Number.isFinite(Number(bruto))) {
    return fechaDeSerie(Number(bruto), base1904)
  }
  return numeroLegible(bruto)
}

/* ---------------------------------------------------------------
   5) Todo junto
   --------------------------------------------------------------- */

/**
 * Lee la primera hoja visible de un .xlsx.
 *
 * Devuelve lo mismo que `leerCsv`, para que a partir de aquí dé igual
 * de dónde venía la lista: { cabeceras, filas, hoja }.
 */
export async function leerXlsx(bytes) {
  if (!sePuedeLeerXlsx()) {
    throw errorAmable(
      'Este navegador no sabe abrir archivos de Excel. Actualízalo, o guarda la ' +
        'lista como CSV desde Excel (Archivo → Guardar como → CSV UTF-8).',
    )
  }

  const zip = abrirZip(bytes)

  if (!zip.entradas.has('xl/workbook.xml')) {
    throw errorAmable('Ese archivo está comprimido, pero no es una hoja de Excel.')
  }

  const libro = await extraerTexto(zip, 'xl/workbook.xml')
  const base1904 = /date1904\s*=\s*"(1|true)"/i.test(libro)

  /* Qué hoja: la primera que no esté oculta. Las ocultas suelen ser
     tablas auxiliares del programa que generó el archivo. */
  const hojas = [...libro.matchAll(/<sheet\b[^>]*?\/?>/g)]
    .map((m) => ({
      nombre: atributo(m[0], 'name') ?? '',
      rid: atributo(m[0], 'r:id') ?? atributo(m[0], 'id'),
      oculta: (atributo(m[0], 'state') ?? 'visible') !== 'visible',
    }))
    .filter((h) => !h.oculta)

  if (hojas.length === 0) {
    throw errorAmable('El archivo de Excel no tiene ninguna hoja visible.')
  }

  const hoja = hojas[0]
  const ruta = await rutaDeLaHoja(zip, hoja.rid)
  const xmlHoja = await extraerTexto(zip, ruta)
  if (!xmlHoja) throw errorAmable('No se ha encontrado la hoja dentro del archivo.')

  const compartidas = [
    ...(await extraerTexto(zip, 'xl/sharedStrings.xml')).matchAll(
      /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g,
    ),
  ].map((m) => textoDeT(m[1]))

  const fechas = estilosDeFecha(await extraerTexto(zip, 'xl/styles.xml'))
  const contexto = { compartidas, fechas, base1904 }

  /* Las filas y las celdas vacías no se escriben en el XML: una fila
     puede saltar de la columna A a la D. Por eso se coloca cada celda
     en su sitio por la referencia (A1, B1…) y no por el orden. */
  const filas = []
  let ancho = 0

  for (const fila of xmlHoja.matchAll(/<row\b[^>]*(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const celdas = []
    for (const celda of (fila[1] ?? '').matchAll(
      /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const referencia = atributo(`<c${celda[1]}>`, 'r')
      const columna = referencia ? columnaDe(referencia) : celdas.length
      celdas[columna] = valorDeCelda(`<c${celda[1]}>`, celda[2] ?? '', contexto)
    }

    const completa = Array.from(celdas, (v) => (v ?? '').trim())
    if (completa.some((v) => v !== '')) {
      ancho = Math.max(ancho, completa.length)
      filas.push(completa)
    }
  }

  if (filas.length === 0) {
    throw errorAmable(`La hoja «${hoja.nombre}» del Excel está vacía.`)
  }

  const cabeceras = Array.from({ length: ancho }, (_, i) => filas[0][i] ?? '')
  const cuerpo = filas
    .slice(1)
    .map((f) => Array.from({ length: ancho }, (_, i) => f[i] ?? ''))

  return { cabeceras, filas: cuerpo, hoja: hoja.nombre }
}

/** Dónde está el XML de la hoja, según el archivo de relaciones */
async function rutaDeLaHoja(zip, rid) {
  const rels = await extraerTexto(zip, 'xl/_rels/workbook.xml.rels')

  for (const m of rels.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    if (atributo(m[0], 'Id') !== rid) continue
    const destino = atributo(m[0], 'Target') ?? ''
    // El destino es relativo a xl/, salvo que venga absoluto
    return destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`
  }

  // Sin relaciones utilizables, el sitio de siempre
  if (zip.entradas.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml'
  return [...zip.entradas.keys()].find((n) => /^xl\/worksheets\/.+\.xml$/.test(n)) ?? ''
}
