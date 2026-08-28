/* ================================================================
   PACIENTES <-> CSV — mudarse de otro programa, o salir de este

   Nadie empieza una consulta desde cero: los pacientes ya están en
   otro sitio, casi siempre en un Excel o en el gestor anterior. Y al
   revés: los datos son de ella, así que tiene que poder sacarlos
   cuando quiera y llevárselos donde quiera. Las dos direcciones viven
   aquí, sin React de por medio, para poder razonarlas por separado.

   Entran dos formatos, el CSV (`lib/csv.js`) y el Excel de verdad,
   el .xlsx (`lib/xlsx.js`); a partir de `leerArchivoDePacientes` da
   igual de cuál venía la lista, porque los dos dan lo mismo:
   cabeceras y filas de texto.

   Lo delicado no es leer el archivo, es que cada programa llama a las
   cosas de una manera: «Telf.», «Móvil», «Phone», «Nombre completo»,
   «Apellido 1»… Por eso hay una lista de alias por campo y, cuando la
   adivinanza falla, la pantalla deja corregir la correspondencia a
   mano.
   ================================================================ */

import { decodificarTexto, leerCsv } from './csv'
import { errorAmable, esXlsAntiguo, esZip, leerXlsx } from './xlsx'
import { normalizar } from './formato'
import { errorDeNif, normalizarNif } from './nif'

/* ---------------------------------------------------------------
   Abrir el archivo que ella haya elegido

   Se mira lo que hay DENTRO, no la extensión: renombrar un CSV a
   .xlsx es un clásico, y el error que saldría entonces («archivo
   comprimido ilegible») no lo entendería nadie.

   Lanza siempre un error `amable`, con el mensaje ya escrito para la
   pantalla. Es la excepción a la costumbre de la casa —`{ data,
   error }`— porque aquí no hay una capa de servicios de por medio: lo
   llama la ventana directamente y lo envuelve en su try.
   --------------------------------------------------------------- */
export async function leerArchivoDePacientes(archivo) {
  const bytes = new Uint8Array(await archivo.arrayBuffer())

  if (esXlsAntiguo(bytes)) {
    throw errorAmable(
      'Ese Excel está guardado en el formato antiguo (.xls), que no se puede leer aquí. ' +
        'Ábrelo en Excel y usa Archivo → Guardar como → Libro de Excel (.xlsx), o CSV UTF-8.',
    )
  }

  if (esZip(bytes)) {
    try {
      return await leerXlsx(bytes)
    } catch (e) {
      if (e?.amable) throw e
      // Un ZIP que no se deja abrir: dañado, con contraseña o hecho por
      // algo que no es Excel. El detalle técnico va a la consola.
      console.error('[Psicofactur] el .xlsx no se ha podido abrir:', e)
      throw errorAmable(
        'No se ha podido abrir ese Excel. Puede estar dañado o protegido con contraseña: ' +
          'ábrelo y vuelve a guardarlo, o guárdalo como CSV UTF-8.',
      )
    }
  }

  const { cabeceras, filas } = leerCsv(decodificarTexto(bytes))
  return { cabeceras, filas, hoja: '' }
}

/* ---------------------------------------------------------------
   Los campos de la ficha y cómo los llaman por ahí

   `alias` se compara ya normalizado (sin tildes, sin signos y en
   minúsculas), así que «Fecha de Nacimiento» y «FECHA-NACIMIENTO»
   son la misma cosa. La primera etiqueta de cada campo es además la
   que se usa al exportar: un archivo exportado desde aquí se vuelve
   a importar sin tocar nada.
   --------------------------------------------------------------- */
export const CAMPOS = [
  {
    id: 'nombre',
    etiqueta: 'Nombre y apellidos',
    alias: [
      'nombre y apellidos', 'nombre completo', 'nombre', 'nombres', 'paciente',
      'nombre del paciente', 'cliente', 'name', 'full name', 'first name',
    ],
  },
  {
    id: 'apellidos',
    etiqueta: 'Apellidos',
    ayuda: 'Sólo si en el archivo van en una columna aparte.',
    alias: [
      'apellidos', 'apellido', 'apellido 1', 'apellido1', 'primer apellido',
      'last name', 'surname', 'family name',
    ],
  },
  {
    id: 'apellido2',
    etiqueta: 'Segundo apellido',
    ayuda: 'Igual que el anterior: sólo si va en su propia columna.',
    alias: ['apellido 2', 'apellido2', 'segundo apellido', 'second surname'],
  },
  {
    id: 'dni',
    etiqueta: 'DNI',
    alias: [
      'dni', 'nif', 'nie', 'dni nif', 'nif dni', 'documento', 'n documento',
      'numero de documento', 'documento de identidad', 'identificacion',
    ],
  },
  {
    id: 'telefono',
    etiqueta: 'Teléfono',
    alias: [
      'telefono', 'telefono movil', 'tlf', 'telf', 'tfno', 'tel', 'movil', 'celular',
      'phone', 'mobile', 'mobile phone', 'numero de telefono', 'contacto',
    ],
  },
  {
    id: 'correo',
    etiqueta: 'Correo electrónico',
    alias: [
      'correo electronico', 'correo', 'email', 'e mail', 'mail',
      'direccion de correo', 'email address',
    ],
  },
  {
    id: 'fechaNacimiento',
    etiqueta: 'Fecha de nacimiento',
    alias: [
      'fecha de nacimiento', 'fecha nacimiento', 'f nacimiento', 'fnac',
      'nacimiento', 'birthdate', 'date of birth', 'dob', 'cumpleanos',
    ],
  },
  {
    id: 'precioSesion',
    etiqueta: 'Precio por sesión',
    alias: [
      'precio por sesion', 'precio sesion', 'precio', 'tarifa', 'importe',
      'honorarios', 'fee', 'price', 'rate',
    ],
  },
  {
    id: 'inicioTerapia',
    etiqueta: 'Inicio de la terapia',
    alias: [
      'inicio de la terapia', 'inicio terapia', 'fecha de alta', 'alta',
      'fecha de inicio', 'primera sesion', 'first session', 'start date',
    ],
  },
  {
    id: 'observaciones',
    etiqueta: 'Observaciones',
    alias: [
      'observaciones', 'notas', 'nota', 'comentarios', 'anotaciones',
      'motivo de consulta', 'notes', 'comments',
    ],
  },
  {
    id: 'estado',
    etiqueta: 'Estado',
    ayuda: '«Archivado» o «Inactivo» dan de alta la ficha ya archivada.',
    alias: ['estado', 'situacion', 'activo', 'status', 'active'],
  },
  {
    id: 'progenitor1Nombre',
    etiqueta: 'Progenitor 1 · Nombre',
    ayuda: 'Datos de los padres o tutores, para pacientes menores.',
    alias: [
      'progenitor 1 nombre', 'progenitor1 nombre', 'madre', 'nombre madre',
      'nombre de la madre', 'tutor 1', 'tutor 1 nombre', 'padre madre 1',
    ],
  },
  {
    id: 'progenitor1Dni',
    etiqueta: 'Progenitor 1 · DNI',
    alias: [
      'progenitor 1 dni', 'progenitor1 dni', 'dni madre', 'dni de la madre',
      'dni tutor 1', 'nif madre',
    ],
  },
  {
    id: 'progenitor1Telefono',
    etiqueta: 'Progenitor 1 · Teléfono',
    alias: [
      'progenitor 1 telefono', 'progenitor1 telefono', 'telefono madre',
      'movil madre', 'telefono de la madre', 'telefono tutor 1',
    ],
  },
  {
    id: 'progenitor1Correo',
    etiqueta: 'Progenitor 1 · Correo electrónico',
    alias: [
      'progenitor 1 correo', 'progenitor1 correo', 'email madre', 'correo madre',
      'email de la madre', 'correo tutor 1', 'email tutor 1',
    ],
  },
  {
    id: 'progenitor2Nombre',
    etiqueta: 'Progenitor 2 · Nombre',
    alias: [
      'progenitor 2 nombre', 'progenitor2 nombre', 'padre', 'nombre padre',
      'nombre del padre', 'tutor 2', 'tutor 2 nombre', 'padre madre 2',
    ],
  },
  {
    id: 'progenitor2Dni',
    etiqueta: 'Progenitor 2 · DNI',
    alias: [
      'progenitor 2 dni', 'progenitor2 dni', 'dni padre', 'dni del padre',
      'dni tutor 2', 'nif padre',
    ],
  },
  {
    id: 'progenitor2Telefono',
    etiqueta: 'Progenitor 2 · Teléfono',
    alias: [
      'progenitor 2 telefono', 'progenitor2 telefono', 'telefono padre',
      'movil padre', 'telefono del padre', 'telefono tutor 2',
    ],
  },
  {
    id: 'progenitor2Correo',
    etiqueta: 'Progenitor 2 · Correo electrónico',
    alias: [
      'progenitor 2 correo', 'progenitor2 correo', 'email padre', 'correo padre',
      'email del padre', 'correo tutor 2', 'email tutor 2',
    ],
  },
]

/* Los ocho campos de progenitores, para no repetir la lista en cada sitio */
const CAMPOS_PROGENITORES = [
  'progenitor1Nombre', 'progenitor1Dni', 'progenitor1Telefono', 'progenitor1Correo',
  'progenitor2Nombre', 'progenitor2Dni', 'progenitor2Telefono', 'progenitor2Correo',
]

/** 'Fecha de Nacimiento ' -> 'fecha de nacimiento' */
function clave(texto) {
  return normalizar(texto).replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Adivina qué columna del archivo alimenta cada campo de la ficha.
 * Devuelve { nombre: 0, dni: 3, … }; los campos que no se encuentran
 * no aparecen en el objeto.
 */
export function detectarColumnas(cabeceras) {
  const claves = cabeceras.map(clave)
  const mapa = {}
  const usadas = new Set()

  // Primero la coincidencia exacta y sólo después la parcial: si hay
  // «Teléfono» y «Teléfono de contacto», gana la que se llama igual.
  for (const campo of CAMPOS) {
    const i = claves.findIndex((c, idx) => !usadas.has(idx) && campo.alias.includes(c))
    if (i !== -1) {
      mapa[campo.id] = i
      usadas.add(i)
    }
  }

  for (const campo of CAMPOS) {
    if (mapa[campo.id] !== undefined) continue
    const i = claves.findIndex(
      (c, idx) => !usadas.has(idx) && c && campo.alias.some((a) => c.includes(a)),
    )
    if (i !== -1) {
      mapa[campo.id] = i
      usadas.add(i)
    }
  }

  return mapa
}

/* ---------------------------------------------------------------
   Convertir lo que venga en algo que la ficha entienda
   --------------------------------------------------------------- */

/** '15/03/1984', '1984-03-15', '15.3.84' -> '1984-03-15' ('' si no hay forma) */
export function fechaDeTexto(valor) {
  const texto = String(valor ?? '').trim()
  if (!texto) return ''

  // ISO, con o sin hora detrás
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return fechaValida(+iso[1], +iso[2], +iso[3])

  const partes = texto.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (!partes) return ''

  const a = Number(partes[1])
  const b = Number(partes[2])
  let ano = Number(partes[3])

  // 1984/03/15: si lo primero es un año, la fecha viene al revés
  if (a > 31) return fechaValida(a, b, ano)

  // En España el día va delante. Si el primer número no puede ser un
  // mes (>12) queda confirmado; si el que no puede ser mes es el
  // segundo, es una fecha americana y hay que darle la vuelta.
  let dia = a
  let mes = b
  if (a <= 12 && b > 12) {
    dia = b
    mes = a
  }

  if (ano < 100) {
    // '84' es 1984 y '05' es 2005: ni para nacimientos ni para altas
    // hay ningún caso razonable al otro lado del corte.
    ano += ano > 30 ? 1900 : 2000
  }

  return fechaValida(ano, mes, dia)
}

function fechaValida(ano, mes, dia) {
  if (!ano || !mes || !dia || mes > 12 || dia > 31) return ''
  const f = new Date(ano, mes - 1, dia)
  if (f.getFullYear() !== ano || f.getMonth() !== mes - 1 || f.getDate() !== dia) return ''
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** '+34 600 00 00 00', '0034600000000' -> '600000000' */
export function telefonoDeTexto(valor) {
  let digitos = String(valor ?? '').replace(/[^\d+]/g, '')
  if (digitos.startsWith('+34')) digitos = digitos.slice(3)
  else if (digitos.startsWith('0034')) digitos = digitos.slice(4)
  else if (digitos.startsWith('34') && digitos.length === 11) digitos = digitos.slice(2)
  return digitos.replace(/\+/g, '')
}

/** '60,00 €', '1.234,50', '60.00' -> número (null si no hay nada) */
export function precioDeTexto(valor) {
  const texto = String(valor ?? '').replace(/[^\d,.-]/g, '').trim()
  if (!texto) return null

  let normalizado = texto
  const coma = texto.lastIndexOf(',')
  const punto = texto.lastIndexOf('.')

  if (coma !== -1 && punto !== -1) {
    // El último de los dos es el separador decimal; el otro, de miles
    normalizado =
      coma > punto
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto.replace(/,/g, '')
  } else if (coma !== -1) {
    normalizado = texto.replace(',', '.')
  }

  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

/** 'Archivado', 'No', 'Inactivo' -> false. Cualquier otra cosa -> true */
function activoDeTexto(valor) {
  const texto = clave(valor)
  if (!texto) return true
  return !['archivado', 'archivada', 'inactivo', 'inactiva', 'baja', 'no', 'false', '0'].includes(
    texto,
  )
}

/** El nombre tal cual se compara: sin tildes, en minúsculas y sin dobles espacios */
function claveNombre(nombre) {
  return normalizar(nombre).replace(/\s+/g, ' ').trim()
}

/* ---------------------------------------------------------------
   Analizar el archivo entero
   --------------------------------------------------------------- */

/**
 * Cruza las filas del archivo con los pacientes que ya hay.
 *
 * Devuelve una lista paralela a `filas`, una entrada por línea:
 *
 *   estado    'nuevo' | 'duplicado' | 'sin-nombre'
 *   paciente  los datos ya convertidos, listos para guardar
 *   existente el paciente con el que choca, si es duplicado
 *   relleno   qué campos vacíos del existente completaría el archivo
 *   avisos    lo que conviene mirar (un DNI con la letra cambiada…)
 *
 * Un paciente es el mismo si coincide el DNI; si no hay DNI, si
 * coincide el teléfono; y si tampoco hay teléfono, si coincide el
 * nombre. Es el criterio que aplicaría cualquiera a ojo, y vale
 * también entre líneas del propio archivo: las listas exportadas de
 * otros programas repiten pacientes con frecuencia.
 */
export function analizarImportacion({ filas, mapa, existentes = [] }) {
  const porDni = new Map()
  const porTelefono = new Map()
  const porNombre = new Map()

  const indexar = (p) => {
    if (p.dni) porDni.set(normalizarNif(p.dni), p)
    if (p.telefono) porTelefono.set(telefonoDeTexto(p.telefono), p)
    if (p.nombre) porNombre.set(claveNombre(p.nombre), p)
  }
  existentes.forEach(indexar)

  return filas.map((fila, i) => {
    const dame = (campo) => {
      const col = mapa[campo]
      if (col === undefined || col === null || col < 0) return ''
      return (fila[col] ?? '').trim()
    }

    const avisos = []

    const nombre = [dame('nombre'), dame('apellidos'), dame('apellido2')]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const dni = dame('dni') ? normalizarNif(dame('dni')) : ''
    if (dni) {
      // La fila no se descarta: el dato es suyo y ya lo revisará. Pero
      // con la letra cambiada Hacienda rechaza la factura, así que se avisa.
      const problema = errorDeNif(dni)
      if (problema) avisos.push(`DNI: ${problema}`)
    }

    const correo = dame('correo').toLowerCase()
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      avisos.push('El correo no parece una dirección válida.')
    }

    const telefono = telefonoDeTexto(dame('telefono'))
    if (dame('telefono') && !telefono) avisos.push('El teléfono no tiene números.')

    const fechaNacimiento = fechaDeTexto(dame('fechaNacimiento'))
    if (dame('fechaNacimiento') && !fechaNacimiento) {
      avisos.push('No se ha entendido la fecha de nacimiento; se deja vacía.')
    }

    const inicioTerapia = fechaDeTexto(dame('inicioTerapia'))
    if (dame('inicioTerapia') && !inicioTerapia) {
      avisos.push('No se ha entendido el inicio de la terapia; se deja vacío.')
    }

    const paciente = {
      nombre,
      dni,
      telefono,
      correo,
      fechaNacimiento,
      precioSesion: precioDeTexto(dame('precioSesion')) ?? 0,
      inicioTerapia,
      observaciones: dame('observaciones'),
      activo: activoDeTexto(dame('estado')),
      progenitor1Nombre: dame('progenitor1Nombre'),
      progenitor1Dni: dame('progenitor1Dni') ? normalizarNif(dame('progenitor1Dni')) : '',
      progenitor1Telefono: telefonoDeTexto(dame('progenitor1Telefono')),
      progenitor1Correo: dame('progenitor1Correo').toLowerCase(),
      progenitor2Nombre: dame('progenitor2Nombre'),
      progenitor2Dni: dame('progenitor2Dni') ? normalizarNif(dame('progenitor2Dni')) : '',
      progenitor2Telefono: telefonoDeTexto(dame('progenitor2Telefono')),
      progenitor2Correo: dame('progenitor2Correo').toLowerCase(),
    }

    if (!nombre) return { linea: i + 2, estado: 'sin-nombre', paciente, avisos }

    const existente =
      (dni && porDni.get(dni)) ||
      (telefono && porTelefono.get(telefono)) ||
      porNombre.get(claveNombre(nombre)) ||
      null

    if (existente) {
      return {
        linea: i + 2,
        estado: 'duplicado',
        paciente,
        existente,
        relleno: camposQueCompletan(existente, paciente),
        avisos,
      }
    }

    // Se indexa también lo nuevo: si el archivo repite al paciente más
    // abajo, la segunda vez saldrá como duplicado y no se creará dos veces
    indexar(paciente)
    return { linea: i + 2, estado: 'nuevo', paciente, avisos }
  })
}

/**
 * Qué huecos de la ficha que ya existe rellenaría el archivo.
 *
 * Sólo huecos: lo que ya está escrito en la aplicación NO se pisa. Un
 * teléfono corregido a mano el mes pasado no puede perderse porque el
 * archivo del programa antiguo traiga todavía el viejo.
 */
export function camposQueCompletan(existente, entrante) {
  const relleno = {}
  const textos = [
    'dni', 'telefono', 'correo', 'fechaNacimiento', 'inicioTerapia', 'observaciones',
    ...CAMPOS_PROGENITORES,
  ]
  for (const campo of textos) {
    if (!existente[campo] && entrante[campo]) relleno[campo] = entrante[campo]
  }
  if (!existente.precioSesion && entrante.precioSesion) {
    relleno.precioSesion = entrante.precioSesion
  }
  return relleno
}

/* ---------------------------------------------------------------
   Salida
   --------------------------------------------------------------- */

const COLUMNAS_EXPORTACION = [
  ['Nombre y apellidos', (p) => p.nombre],
  ['DNI', (p) => p.dni],
  ['Teléfono', (p) => p.telefono],
  ['Correo electrónico', (p) => p.correo],
  ['Fecha de nacimiento', (p) => p.fechaNacimiento],
  ['Precio por sesión', (p) => (p.precioSesion ? String(p.precioSesion).replace('.', ',') : '')],
  ['Inicio de la terapia', (p) => p.inicioTerapia],
  ['Observaciones', (p) => p.observaciones],
  ['Estado', (p) => (p.activo ? 'Activo' : 'Archivado')],
  ['Progenitor 1 · Nombre', (p) => p.progenitor1Nombre],
  ['Progenitor 1 · DNI', (p) => p.progenitor1Dni],
  ['Progenitor 1 · Teléfono', (p) => p.progenitor1Telefono],
  ['Progenitor 1 · Correo electrónico', (p) => p.progenitor1Correo],
  ['Progenitor 2 · Nombre', (p) => p.progenitor2Nombre],
  ['Progenitor 2 · DNI', (p) => p.progenitor2Dni],
  ['Progenitor 2 · Teléfono', (p) => p.progenitor2Telefono],
  ['Progenitor 2 · Correo electrónico', (p) => p.progenitor2Correo],
]

/** Los pacientes en filas de CSV, con las cabeceras que se reconocen al volver */
export function filasDeExportacion(pacientes) {
  return {
    cabeceras: COLUMNAS_EXPORTACION.map(([titulo]) => titulo),
    filas: pacientes.map((p) => COLUMNAS_EXPORTACION.map(([, valor]) => valor(p) ?? '')),
  }
}
