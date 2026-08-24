import { aClave, inicioSemana, sumarDias } from './fechas'

/* ================================================================
   LISTA DE ESPERA — reglas de negocio, sin base de datos

   Aquí vive lo único que hay que entender de la función: cuándo un
   hueco que se ha liberado le sirve a alguien que está esperando.

   Se queda fuera de `services/` a propósito: no toca Supabase, así que
   la pantalla del calendario puede cruzar huecos y esperas sin pedir
   nada más al servidor.
   ================================================================ */

/** A partir de esta hora se considera tarde. Las 14:00 es la comida. */
export const HORA_CORTE = 14

export const FRANJAS = {
  manana: { id: 'manana', etiqueta: 'Por la mañana', corta: 'Mañanas' },
  tarde: { id: 'tarde', etiqueta: 'Por la tarde', corta: 'Tardes' },
  cualquiera: { id: 'cualquiera', etiqueta: 'Me da igual', corta: 'A cualquier hora' },
}

export const LISTA_FRANJAS = Object.values(FRANJAS)

/** 'HH:MM' -> 'manana' | 'tarde' */
export function franjaDeHora(hora) {
  return Number(String(hora).split(':')[0]) < HORA_CORTE ? 'manana' : 'tarde'
}

/**
 * ¿Este hueco le sirve a quien está esperando?
 *
 * Dos condiciones y ninguna más: que el día caiga dentro de la ventana
 * que pidió, y que la hora sea de la franja que pidió. El tipo de sesión
 * NO filtra: si ella quiere dar un hueco de 55 minutos a una pareja, es
 * decisión suya y lo ajusta al crear la cita.
 *
 * Las fechas van como 'YYYY-MM-DD', que se comparan como texto en el
 * mismo orden que como fechas.
 */
export function encajaEnHueco(espera, hueco) {
  if (hueco.fecha < espera.desde || hueco.fecha > espera.hasta) return false
  if (espera.franja === 'cualquiera') return true
  return franjaDeHora(hueco.hora) === espera.franja
}

/** Los huecos que le sirven a una espera, en orden */
export function huecosDe(espera, huecos) {
  return huecos.filter((h) => encajaEnHueco(espera, h))
}

/** Quién encaja en un hueco. Primero el que lleva más tiempo esperando. */
export function esperasDe(hueco, esperas) {
  return esperas.filter((e) => encajaEnHueco(e, hueco))
}

/**
 * La ventana «esta semana» / «la semana que viene», de lunes a domingo.
 * Es lo que se pide el 90 % de las veces, así que va como atajo en el
 * formulario en vez de hacerla escribir dos fechas.
 *
 * Si la semana ya ha empezado, la ventana arranca hoy: no tiene sentido
 * esperar un hueco del lunes pasado.
 */
export function ventanaSemana(semanasDesdeHoy = 0) {
  const lunes = sumarDias(inicioSemana(new Date()), semanasDesdeHoy * 7)
  const domingo = sumarDias(lunes, 6)
  const claveHoy = aClave(new Date())
  const desde = aClave(lunes)
  return { desde: desde < claveHoy ? claveHoy : desde, hasta: aClave(domingo) }
}

/** Una espera cuya ventana ya ha pasado: sigue en la cola pero ya no sirve */
export function estaCaducada(espera, claveHoy) {
  return espera.hasta < claveHoy
}
