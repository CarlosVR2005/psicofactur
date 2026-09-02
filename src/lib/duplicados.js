/* ================================================================
   FICHAS DUPLICADAS — encontrar la misma persona escrita dos veces

   Pasa a menudo: se crea una ficha nueva sin caer en que el paciente
   ya estaba, casi siempre porque el nombre no se tecleó igual («Mª
   Ángeles Ruiz» / «Ma Angeles Ruiz»). Cada ficha se queda con un trozo
   del histórico y ninguna lo tiene entero.

   Aquí sólo se DETECTA y se agrupa. Fusionar de verdad —mover citas,
   facturas e historia clínica de una ficha a otra— lo hace la función
   `fusionar_pacientes` de la base (migración 0031), y siempre después
   de que ella lo confirme en pantalla.

   El criterio de «es la misma persona» es el mismo que ya usa la
   importación (`analizarImportacion` en `lib/pacientesCsv.js`): primero
   el DNI, luego el teléfono, luego el nombre. Aquí se añade el parecido
   de nombres, que allí no hace falta.
   ================================================================ */

import { normalizar } from './formato'
import { normalizarNif } from './nif'
import { telefonoDeTexto } from './pacientesCsv'

/* De más a menos fiable. El número es para ordenar y para quedarnos con
   la señal más fuerte cuando un grupo se forma por varias a la vez. */
export const CONFIANZA = { alta: 3, media: 2, baja: 1 }

export const MOTIVO = {
  dni: { etiqueta: 'Mismo DNI', confianza: 'alta' },
  telefono: { etiqueta: 'Mismo teléfono', confianza: 'media' },
  nombre: { etiqueta: 'Nombres parecidos', confianza: 'baja' },
}

/* ----------------------------------------------------------------
   Parecido de nombres
   ---------------------------------------------------------------- */

/* Palabras que no distinguen a nadie y estorban al comparar. */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do'])

/** 'Mª Ángeles de la Cruz' -> ['ma', 'angeles', 'cruz'] */
function palabrasNombre(nombre) {
  return normalizar(nombre)
    .replace(/[ªº]/g, (m) => (m === 'ª' ? 'a' : 'o')) // Mª -> ma, 1º -> 1o
    .replace(/[.,;:]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !CONECTORES.has(p))
}

/** ¿'gomze' y 'gomez' son la misma palabra con un dedazo? (subst/insert/borrado) */
function aUnaLetra(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let fallos = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    fallos += 1
    if (fallos > 1) return false
    if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  if (i < a.length || j < b.length) fallos += 1
  return fallos <= 1
}

/** Además del dedazo, la letra bailada: 'gomze' ~ 'gomez' */
function palabraParecida(a, b) {
  if (a === b) return true
  // Inicial contra nombre entero: 'b' ~ 'belen'
  if (a.length === 1) return b.startsWith(a)
  if (b.length === 1) return a.startsWith(b)
  // A partir de 4 letras se tolera una diferencia; por debajo, no: son
  // nombres cortos donde un cambio ya es otra persona (Ana / Eva).
  if (a.length < 4 || b.length < 4) return false
  if (aUnaLetra(a, b)) return true
  if (a.length === b.length) {
    for (let k = 0; k < a.length - 1; k += 1) {
      if (
        a[k] === b[k + 1] &&
        a[k + 1] === b[k] &&
        a.slice(0, k) === b.slice(0, k) &&
        a.slice(k + 2) === b.slice(k + 2)
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * ¿Estos dos nombres son la misma persona escrita distinto?
 *
 * Regla: todas las palabras del nombre más corto tienen que casar con
 * una palabra distinta del más largo —por igualdad, por inicial o con
 * un dedazo— y tienen que coincidir al menos dos. Así «Ana Gómez» y
 * «Ana B. Gómez Ruiz» se juntan, pero «Ana Gómez Ruiz» y «Luis Gómez
 * Ruiz» no.
 */
export function nombresParecidos(nombreA, nombreB) {
  const a = palabrasNombre(nombreA)
  const b = palabrasNombre(nombreB)
  if (a.length < 2 || b.length < 2) return false

  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a]
  const usados = new Array(largo.length).fill(false)
  let coincidencias = 0

  for (const palabra of corto) {
    const idx = largo.findIndex((p, i) => !usados[i] && palabraParecida(palabra, p))
    if (idx === -1) return false
    usados[idx] = true
    coincidencias += 1
  }
  return coincidencias >= 2
}

/* ----------------------------------------------------------------
   Emparejar dos fichas
   ---------------------------------------------------------------- */

function dniNorm(p) {
  return p.dni ? normalizarNif(p.dni) : ''
}
function telNorm(p) {
  return p.telefono ? telefonoDeTexto(p.telefono) : ''
}

/**
 * Por qué (o por qué no) estas dos fichas son la misma persona.
 * Devuelve el `motivo` ('dni' | 'telefono' | 'nombre') o null.
 *
 * Frenos: un DNI distinto confirmado nunca es la misma persona. Una
 * fecha de nacimiento distinta descarta el parentesco por teléfono o
 * nombre (dos hermanos comparten el móvil de su madre), pero NO tumba
 * un DNI que coincide: ahí lo más probable es un dedazo en la fecha.
 */
export function porQueSonLaMisma(a, b) {
  const dniA = dniNorm(a)
  const dniB = dniNorm(b)

  if (dniA && dniB) {
    if (dniA === dniB) return 'dni'
    return null // DNIs distintos: personas distintas, y punto
  }

  const fechasChocan =
    a.fechaNacimiento && b.fechaNacimiento && a.fechaNacimiento !== b.fechaNacimiento
  if (fechasChocan) return null

  const telA = telNorm(a)
  const telB = telNorm(b)
  if (telA && telB && telA === telB) return 'telefono'

  if (nombresParecidos(a.nombre, b.nombre)) return 'nombre'

  return null
}

/* ----------------------------------------------------------------
   Agrupar toda la lista
   ---------------------------------------------------------------- */

/**
 * Recorre la lista y devuelve los grupos de fichas que parecen la misma
 * persona. El emparejamiento es transitivo: si A va con B y B con C, los
 * tres son un grupo (típico de tres altas de la misma persona).
 *
 * @param {Array} pacientes  lista de fichas (objetos de `deFila`)
 * @returns {Array<{ fichas: object[], motivo: string, confianza: string }>}
 *   `motivo` y `confianza` son los de la señal más fuerte del grupo.
 */
export function gruposDuplicados(pacientes) {
  const n = pacientes.length
  const padre = Array.from({ length: n }, (_, i) => i)
  const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))

  // Guarda el motivo más fuerte visto en cada componente, por su raíz.
  const motivoDe = new Map()
  const anotar = (i, motivo) => {
    const r = raiz(i)
    const previo = motivoDe.get(r)
    if (!previo || CONFIANZA[MOTIVO[motivo].confianza] > CONFIANZA[MOTIVO[previo].confianza]) {
      motivoDe.set(r, motivo)
    }
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const motivo = porQueSonLaMisma(pacientes[i], pacientes[j])
      if (!motivo) continue
      const ri = raiz(i)
      const rj = raiz(j)
      const motivoFuerte = motivoDe.get(ri)
      const otroMotivo = motivoDe.get(rj)
      padre[ri] = rj
      // Reúne en la raíz nueva lo mejor de las dos componentes y el par.
      if (motivoFuerte) anotar(rj, motivoFuerte)
      if (otroMotivo) anotar(rj, otroMotivo)
      anotar(rj, motivo)
    }
  }

  const porGrupo = new Map()
  for (let i = 0; i < n; i += 1) {
    const r = raiz(i)
    if (!porGrupo.has(r)) porGrupo.set(r, [])
    porGrupo.get(r).push(pacientes[i])
  }

  const grupos = []
  for (const [r, fichas] of porGrupo) {
    if (fichas.length < 2) continue
    const motivo = motivoDe.get(r) ?? 'nombre'
    grupos.push({ fichas, motivo, confianza: MOTIVO[motivo].confianza })
  }

  // Los más fiables primero, y a igualdad, los grupos más grandes.
  grupos.sort(
    (x, y) =>
      CONFIANZA[y.confianza] - CONFIANZA[x.confianza] || y.fichas.length - x.fichas.length,
  )
  return grupos
}
