/* Utilidades de fecha en español, sin librerías externas.
   Las citas se guardan como { fecha: 'YYYY-MM-DD', hora: 'HH:MM' },
   el mismo formato que usaremos luego en Supabase. */

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Fecha de hoy a las 00:00 (sin horas, para comparar días) */
export function hoy() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Date -> 'YYYY-MM-DD' (en horario local, nunca UTC) */
export function aClave(fecha) {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 'YYYY-MM-DD' -> Date local a las 00:00 */
export function deClave(clave) {
  const [y, m, d] = clave.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 'YYYY-MM-DD' + 'HH:MM' -> Date completo */
export function aFechaHora(clave, hora = '00:00') {
  const f = deClave(clave)
  const [h, min] = hora.split(':').map(Number)
  f.setHours(h, min, 0, 0)
  return f
}

export function sumarDias(fecha, dias) {
  const d = new Date(fecha)
  d.setDate(d.getDate() + dias)
  return d
}

export function sumarMeses(fecha, meses) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth() + meses, 1)
  return d
}

export function mismoDia(a, b) {
  return aClave(a) === aClave(b)
}

export function esHoy(clave) {
  return clave === aClave(hoy())
}

/** Lunes de la semana de `fecha` */
export function inicioSemana(fecha) {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  const dia = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - dia)
  return d
}

/** Los 7 días (Date) de la semana de `fecha` */
export function diasDeSemana(fecha) {
  const lunes = inicioSemana(fecha)
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/** Matriz de 6 semanas x 7 días que cubre el mes de `fecha` */
export function semanasDelMes(fecha) {
  const primero = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
  const inicio = inicioSemana(primero)
  return Array.from({ length: 6 }, (_, semana) =>
    Array.from({ length: 7 }, (_, dia) => sumarDias(inicio, semana * 7 + dia)),
  )
}

/** 'lunes, 12 de mayo' */
export function fechaLarga(fecha) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return `${dias[fecha.getDay()]}, ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`
}

/** '12 may' */
export function fechaCorta(fecha) {
  return `${fecha.getDate()} ${MESES[fecha.getMonth()].slice(0, 3)}`
}

/** '12/05/2026' */
export function fechaNumerica(fecha) {
  const d = typeof fecha === 'string' ? deClave(fecha) : fecha
  return d.toLocaleDateString('es-ES')
}

/** 'mayo 2026' */
export function mesYAno(fecha) {
  return `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`
}

/** Suma minutos a 'HH:MM' -> 'HH:MM' */
export function sumarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number)
  const total = h * 60 + m + minutos
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Minutos entre dos horas 'HH:MM' del mismo día. Negativo si se solapan. */
export function minutosEntre(desde, hasta) {
  const [h1, m1] = desde.split(':').map(Number)
  const [h2, m2] = hasta.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}

/** 90 -> '1 h 30 min'. Para los huecos de la agenda. */
export function duracionLegible(minutos) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m} min`
  if (m === 0) return h === 1 ? '1 h' : `${h} h`
  return `${h} h ${m} min`
}

/** 'Hoy' · 'Mañana' · 'jueves, 14 de mayo' */
export function etiquetaDia(clave) {
  const f = deClave(clave)
  const h = hoy()
  if (mismoDia(f, h)) return 'Hoy'
  if (mismoDia(f, sumarDias(h, 1))) return 'Mañana'
  if (mismoDia(f, sumarDias(h, -1))) return 'Ayer'
  return fechaLarga(f)
}

/** 'hace 5 min' · 'hace 2 h' · 'hace 3 días' */
export function haceRato(fechaISO) {
  const diff = Date.now() - new Date(fechaISO).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}

export function edad(fechaNacimiento) {
  const n = deClave(fechaNacimiento)
  const h = hoy()
  let e = h.getFullYear() - n.getFullYear()
  const m = h.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) e--
  return e
}
