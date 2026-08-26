import {
  aClave,
  aFechaHora,
  deClave,
  horasEnPuntoEntre,
  inicioSemana,
  sumarDias,
  sumarMinutos,
} from './fechas'

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

/* ================================================================
   HORARIO DE TRABAJO -> huecos libres de verdad

   Hasta aquí, un «hueco liberado» sólo salía de una cita cancelada. Con
   el horario configurado se puede hacer mejor: cualquier rato dentro de
   su jornada que no tenga una cita viva encima es un hueco, se haya
   cancelado algo ahí o no se haya ocupado nunca. Una cancelación ya no
   es un caso especial: simplemente deja de "ocupar", así que su rato
   sale solo del cálculo.
   ================================================================ */

/** El id de cada día, en el mismo orden que Date.getDay() (0 = domingo) */
export const DIA_ID_POR_INDICE = [
  'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
]

/** Para pintar el formulario de Ajustes, de lunes a domingo */
export const DIAS_SEMANA = [
  { id: 'lunes', etiqueta: 'Lunes' },
  { id: 'martes', etiqueta: 'Martes' },
  { id: 'miercoles', etiqueta: 'Miércoles' },
  { id: 'jueves', etiqueta: 'Jueves' },
  { id: 'viernes', etiqueta: 'Viernes' },
  { id: 'sabado', etiqueta: 'Sábado' },
  { id: 'domingo', etiqueta: 'Domingo' },
]

/** Horario vacío: un día por clave, sin tramos y sin trabajar. */
export function horarioVacio() {
  return DIAS_SEMANA.reduce((acc, dia) => {
    acc[dia.id] = { trabaja: false, tramos: [] }
    return acc
  }, {})
}

/** ¿Hay algún día configurado de verdad, con tramos? */
export function horarioConfigurado(horario) {
  return Object.values(horario ?? {}).some((d) => d?.trabaja && d.tramos?.length > 0)
}

/** ¿Este fecha+hora todavía no ha pasado? Un hueco de hoy a las 14:00 no
    sirve de nada ofrecerlo a las 16:00. */
export function esFuturo(fecha, hora) {
  return aFechaHora(fecha, hora).getTime() > Date.now()
}

function aMinutos(hora) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

function deMinutos(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

/** Quita `ocupada` de cada intervalo de `libres`. Puede partirlo en dos. */
function restarOcupada(libres, ocupada) {
  const oDesde = aMinutos(ocupada.desde)
  const oHasta = aMinutos(ocupada.hasta)

  return libres.flatMap(({ desde, hasta }) => {
    const d = aMinutos(desde)
    const h = aMinutos(hasta)
    if (oHasta <= d || oDesde >= h) return [{ desde, hasta }] // no se tocan

    const partes = []
    if (oDesde > d) partes.push({ desde, hasta: deMinutos(oDesde) })
    if (oHasta < h) partes.push({ desde: deMinutos(oHasta), hasta })
    return partes
  })
}

/**
 * Los huecos libres de verdad entre `desde` y `hasta` (fechas 'YYYY-MM-DD'):
 * dentro del horario de trabajo, quitando las citas que ya hay puestas.
 *
 * @param horario  el de `horarioVacio()`, con los tramos que haya
 * @param citas    { fecha, hora, duracion, estado, pacienteNombre }[] del rango
 */
export function huecosDeHorario({ horario, citas, desde, hasta }) {
  const vivas = citas.filter((c) => c.estado !== 'cancelada')
  // Para poner «Canceló Fulanito» cuando el hueco coincide con una cancelación
  const canceladaEn = new Map(
    citas
      .filter((c) => c.estado === 'cancelada')
      .map((c) => [`${c.fecha} ${c.hora}`, c.pacienteNombre]),
  )

  const resultado = []
  let cursor = deClave(desde)
  const fin = deClave(hasta)

  while (cursor <= fin) {
    const clave = aClave(cursor)
    const config = horario?.[DIA_ID_POR_INDICE[cursor.getDay()]]

    if (config?.trabaja) {
      const ocupadasDelDia = vivas
        .filter((c) => c.fecha === clave)
        .map((c) => ({ desde: c.hora, hasta: sumarMinutos(c.hora, c.duracion) }))

      for (const tramo of config.tramos ?? []) {
        let libres = [tramo]
        for (const ocupada of ocupadasDelDia) libres = restarOcupada(libres, ocupada)

        for (const libre of libres) {
          for (const hora of horasEnPuntoEntre(libre.desde, libre.hasta)) {
            if (!esFuturo(clave, hora)) continue
            resultado.push({
              id: `${clave} ${hora}`,
              fecha: clave,
              hora,
              duracion: 60,
              cancelPor: canceladaEn.get(`${clave} ${hora}`) ?? null,
            })
          }
        }
      }
    }
    cursor = sumarDias(cursor, 1)
  }

  return resultado
}
