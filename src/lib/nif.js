/* ================================================================
   NIF, DNI, NIE y CIF: comprobar la letra de control

   Esto no es una manía de programador. La primera factura que se envió
   de verdad la rechazó Hacienda con el error 1239, «el formato del NIF
   es incorrecto», porque el DNI de la ficha tenía la letra cambiada. El
   envío se acepta, el rechazo llega un minuto después y para entonces
   el número de factura ya está gastado y hay que subsanarla.

   Comprobar la letra aquí cuesta nada y evita todo eso: el número y la
   letra de un DNI están matemáticamente ligados, así que un error de
   tecleo se caza sin preguntarle a nadie.
   ================================================================ */

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'
const LETRAS_CIF_CONTROL = 'JABCDEFGHI'

/* Las organizaciones cuyo dígito de control es SIEMPRE una letra, y las
   que lo tienen siempre numérico. El resto admite las dos formas. */
const CIF_LETRA_OBLIGATORIA = 'PQRSNW'
const CIF_NUMERO_OBLIGATORIO = 'ABEH'

/** Quita espacios, guiones y puntos, y lo pone en mayúsculas. */
export function normalizarNif(valor) {
  return String(valor ?? '')
    .toUpperCase()
    .replace(/[\s.\-_/]/g, '')
}

function letraDni(numero) {
  return LETRAS_DNI[numero % 23]
}

function validarDni(nif) {
  const numero = Number(nif.slice(0, 8))
  return nif[8] === letraDni(numero)
}

function validarNie(nif) {
  // La X, Y o Z inicial vale por un 0, 1 o 2 al calcular la letra
  const prefijo = { X: '0', Y: '1', Z: '2' }[nif[0]]
  const numero = Number(prefijo + nif.slice(1, 8))
  return nif[8] === letraDni(numero)
}

function validarCif(nif) {
  const organizacion = nif[0]
  const digitos = nif.slice(1, 8)
  const control = nif[8]

  let pares = 0
  let impares = 0
  for (let i = 0; i < digitos.length; i += 1) {
    const d = Number(digitos[i])
    if (i % 2 === 0) {
      // Posiciones impares del número (1ª, 3ª…): se duplican y se suman
      // sus cifras. 8 -> 16 -> 1+6 = 7
      const doble = d * 2
      impares += doble > 9 ? doble - 9 : doble
    } else {
      pares += d
    }
  }

  const suma = pares + impares
  const digitoControl = (10 - (suma % 10)) % 10

  if (CIF_LETRA_OBLIGATORIA.includes(organizacion)) {
    return control === LETRAS_CIF_CONTROL[digitoControl]
  }
  if (CIF_NUMERO_OBLIGATORIO.includes(organizacion)) {
    return control === String(digitoControl)
  }
  // Las demás lo admiten de las dos formas
  return control === String(digitoControl) || control === LETRAS_CIF_CONTROL[digitoControl]
}

/**
 * ¿Es un NIF español válido? Acepta DNI, NIE y CIF.
 *
 * Comprueba la FORMA, no la existencia: que la letra cuadre con el
 * número. Que además esté dado de alta en el censo de Hacienda es otra
 * cosa, y eso sólo lo sabe la AEAT.
 */
export function nifValido(valor) {
  const nif = normalizarNif(valor)
  if (nif.length !== 9) return false

  if (/^\d{8}[A-Z]$/.test(nif)) return validarDni(nif)
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) return validarNie(nif)
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return validarCif(nif)

  return false
}

/**
 * Qué decirle a quien lo ha escrito mal. Devuelve null si está bien.
 *
 * Cuando el fallo es sólo la letra de un DNI se dice cuál era la
 * correcta: casi siempre es un dedazo y así se arregla sin ir a buscar
 * el documento.
 */
export function errorDeNif(valor) {
  const nif = normalizarNif(valor)
  if (!nif) return null // vacío no es un error: hay campos opcionales

  if (nif.length !== 9) {
    return 'Un NIF tiene 9 caracteres: 8 números y una letra.'
  }

  if (/^\d{8}[A-Z]$/.test(nif) && !validarDni(nif)) {
    return `La letra no se corresponde con el número. Para el ${nif.slice(0, 8)} sería una ${letraDni(Number(nif.slice(0, 8)))}.`
  }

  if (/^\d{9}$/.test(nif)) {
    return 'Falta la letra al final del DNI.'
  }

  if (!nifValido(nif)) {
    return 'Ese NIF no es válido. Compruébalo en el documento de identidad.'
  }

  return null
}
