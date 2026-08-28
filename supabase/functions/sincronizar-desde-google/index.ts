/* ================================================================
   sincronizar-desde-google

   Trae a la app lo que pasa en Google Calendar. Hace dos cosas:

   1. ACTUALIZAR las citas que ya conoce (movida de hora, borrada, y el
      círculo de color que le pone Confirmafy según responda el paciente).
   2. IMPORTAR los eventos que no conoce, porque en esta consulta MANDA
      GOOGLE: la psicóloga trabaja en su calendario de siempre y encima
      usa las páginas de reserva, así que hay pacientes que entran solos
      sin pasar por la app.

   Importar a lo bruto crearía pacientes llamados «Cerrado» o «Cita
   urólogo». Por eso el criterio es el título del evento:

     · con teléfono   -> es una sesión: se busca al paciente por ese
                         teléfono y, si no existe, se le crea la ficha.
     · sin teléfono   -> no se inventa nada: a `eventos_google_pendientes`
                         para que ella diga de quién es.
     · ruido conocido -> a esa misma tabla, pero ya ignorado, para no
                         inundarle la bandeja de «Cerrado».

   Se dispara de dos formas: el cron cada 10 minutos con la clave de
   servicio (todas las psicólogas), o desde la app con la sesión de ella
   (sólo la suya). Se distingue por el `role` del token, que la
   plataforma ya ha validado antes de llegar aquí.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import { accessTokenValido, ErrorGoogle } from '../_shared/google.ts'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const API = 'https://www.googleapis.com/calendar/v3'

/* Ventana de la pasada completa (primera importación, re-escaneo a mano
   o syncToken caducado): 90 días hacia atrás desde hoy. Se quiere el
   histórico reciente de la consulta, no un año entero de agenda vieja
   (que además duplica fichas al chocar con lo que ya existe). */
const DIAS_ATRAS = 90

/* Y un año hacia delante. El tope hace falta porque, al expandir los
   eventos repetitivos, Google devuelve AÑOS de futuro y la bandeja se
   llenaría de citas de 2030 que no le sirven a nadie. */
const DIAS_ADELANTE = 365

/* Tope de altas por vuelta. La primera importación puede traer cientos
   de eventos y una Edge Function no es eterna. Si se llega al tope no se
   guarda el syncToken, así que la vuelta siguiente repite la pasada y
   sigue por donde iba: lo ya importado se salta solo. */
const MAXIMO_POR_VUELTA = 200

interface Resumen {
  psicologaId: string
  revisados: number
  actualizados: number
  cancelados: number
  creadas: number
  pendientes: number
  parcial?: boolean
  aviso?: string
}

/* ------------------ Leer el titulo del evento ------------------ */

/* Titulos que no son una sesion. «Horarios para cita» NO esta aqui: esos
   son las reservas que hacen los pacientes desde su pagina, y llevan el
   nombre dentro del parentesis. */
const RUIDO = ['cerrado', 'libre', 'vacaciones', 'festivo', 'no laborable']

/** Las reservas de la pagina: «Horarios para cita (Nombre Apellido)» */
const RESERVA = /horarios\s+para\s+cita\s*\(([^)]+)\)/i

/* Ella marca los eventos con circulos de color y apunta la caja del dia
   como un numero suelto. Ni una cosa ni la otra son parte del nombre. */
function sinAdornos(texto: string): string {
  return String(texto ?? '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sinTildes(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
}

/* -------- El circulo de color de Confirmafy -------- */

/* Confirmafy —la app de confirmacion por WhatsApp que usa la psicologa—
   antepone un circulo al titulo del evento segun lo que responda el
   paciente: verde confirmada, amarillo aun sin responder, rojo cancelada.
   Aqui solo se LEE, para poner el estado de la cita. El circulo NO se
   toca nunca: lo gobierna Confirmafy, no nosotros. Una cita sin circulo
   se queda con el estado que ya tenga. */
const BOLA_ESTADO: Record<string, 'confirmada' | 'pendiente' | 'cancelada'> = {
  '\u{1F7E2}': 'confirmada', // circulo verde
  '\u{1F7E1}': 'pendiente', //  circulo amarillo
  '\u{1F534}': 'cancelada', //  circulo rojo
}

/** El estado que pide el circulo del principio del titulo, o null si no lo lleva. */
function estadoPorBola(titulo: unknown): 'confirmada' | 'pendiente' | 'cancelada' | null {
  const primero = String(titulo ?? '')
    .replace(/[\u{FE0F}\u{200D}\s]/gu, '')
    .match(/^[\u{1F7E2}\u{1F7E1}\u{1F534}]/u)
  return primero ? BOLA_ESTADO[primero[0]] : null
}

/** «304», «320 €»: lo que factura en el dia, que se apunta a si misma. */
function esApunteDeCaja(titulo: string): boolean {
  return /^\d{1,6}\s*(?:€|e|eur|euros)?$/i.test(sinTildes(sinAdornos(titulo)))
}

function esRuido(titulo: string): boolean {
  const limpio = sinTildes(titulo)
  if (esApunteDeCaja(titulo)) return true
  // Un hueco libre de la pagina de reservas, sin nadie apuntado
  if (limpio.includes('horarios para cita')) return true
  return RUIDO.some((r) => limpio.includes(r))
}

/**
 * Saca nombre y telefono del titulo, que es como ella los escribe:
 * «Nombre Apellido +34 600 11 22 33», «nombre 688813206»...
 *
 * El telefono es lo que decide si el evento es una sesion, asi que se
 * busca un numero espanol de nueve digitos (empieza por 6, 7, 8 o 9)
 * escrito de cualquier manera.
 */
function datosDelTitulo(titulo: string): { nombre: string | null; telefono: string | null } {
  const bruto = sinAdornos(titulo)
  if (!bruto) return { nombre: null, telefono: null }

  const encaje = bruto.match(/(?:\+?\s*34[\s.\-]*)?([6-9](?:[\s.\-]?\d){8})/)

  if (!encaje) {
    return { nombre: limpiarNombre(bruto), telefono: null }
  }

  const telefono = encaje[1].replace(/\D/g, '')
  // El nombre es lo que queda al quitarle el telefono
  const nombre = limpiarNombre(bruto.replace(encaje[0], ' '))
  return { nombre, telefono }
}

function limpiarNombre(texto: string): string | null {
  const limpio = sinAdornos(texto)
    .replace(/^[\s,.\-+:]+|[\s,.\-+:]+$/g, '')
    .trim()
  return limpio.length >= 2 ? limpio.slice(0, 120) : null
}

/* ------------------------ Un cambio ------------------------ */

async function aplicarCambio(
  admin: SupabaseClient,
  psicologaId: string,
  evento: any,
  resumen: Resumen,
): Promise<void> {
  if (!evento?.id) return

  const { data: cita } = await admin
    .from('citas')
    .select('id, fecha_hora, duracion_minutos, estado_confirmacion')
    .eq('psicologa_id', psicologaId)
    .eq('google_event_id', evento.id)
    .maybeSingle()

  // Un evento que no conocemos: quizá haya que importarlo
  if (!cita) {
    await intentarImportar(admin, psicologaId, evento, resumen)
    return
  }

  resumen.revisados++

  /* Borrado en Google -> la cita se marca cancelada, NO se borra: hay
     facturas colgando de las citas y el histórico no se toca. Se quita
     el vínculo con el evento, que ya no existe. */
  if (evento.status === 'cancelled') {
    if (cita.estado_confirmacion === 'cancelada') return
    const { error } = await admin
      .from('citas')
      .update({ estado_confirmacion: 'cancelada', google_event_id: null })
      .eq('id', cita.id)
    if (!error) resumen.cancelados++
    return
  }

  /* El círculo de Confirmafy: lo que ha respondido el paciente por
     WhatsApp. Sólo se actúa si el evento LLEVA círculo; si no lo lleva
     (cita recién creada, o que ella acaba de reprogramar en la app y por
     eso el título ya no tiene círculo) se deja el estado como está. */
  const estadoBola = estadoPorBola(evento.summary)
  if (estadoBola && estadoBola !== cita.estado_confirmacion) {
    const { error } = await admin
      .from('citas')
      .update({ estado_confirmacion: estadoBola })
      .eq('id', cita.id)
    if (!error) {
      if (estadoBola === 'cancelada') resumen.cancelados++
      else resumen.actualizados++
    }
  }

  // Si la convirtió en un evento de todo el día, se deja como está: una
  // sesión sin hora no tiene sentido en la agenda.
  if (!evento.start?.dateTime) return

  const inicio = new Date(evento.start.dateTime)
  const fin = evento.end?.dateTime ? new Date(evento.end.dateTime) : null
  const duracion = fin
    ? Math.max(5, Math.round((fin.getTime() - inicio.getTime()) / 60000))
    : cita.duracion_minutos

  const mismaHora = new Date(cita.fecha_hora).getTime() === inicio.getTime()
  const mismaDuracion = Number(cita.duracion_minutos) === duracion
  if (mismaHora && mismaDuracion) return

  const { error } = await admin
    .from('citas')
    .update({ fecha_hora: inicio.toISOString(), duracion_minutos: duracion })
    .eq('id', cita.id)

  if (!error) resumen.actualizados++
}

/* --------------------- Importar un evento --------------------- */

async function intentarImportar(
  admin: SupabaseClient,
  psicologaId: string,
  evento: any,
  resumen: Resumen,
): Promise<void> {
  // Borrado, de todo el día o sin hora: no es una sesión que importar
  if (evento.status === 'cancelled' || !evento.start?.dateTime) return

  /* Confirmafy lo ha marcado en rojo: es una cita que el paciente ha
     cancelado, o sea un hueco libre. No se da de alta como sesión. */
  if (estadoPorBola(evento.summary) === 'cancelada') return

  // Ya se miró este evento alguna vez (pendiente, ignorado o resuelto)
  const { data: yaVisto } = await admin
    .from('eventos_google_pendientes')
    .select('id')
    .eq('psicologa_id', psicologaId)
    .eq('google_event_id', evento.id)
    .maybeSingle()
  if (yaVisto) return

  const inicio = new Date(evento.start.dateTime)
  const fin = evento.end?.dateTime ? new Date(evento.end.dateTime) : null
  const duracion = fin ? Math.max(5, Math.round((fin.getTime() - inicio.getTime()) / 60000)) : 55

  /* Duplicados: en su calendario cada sesión aparece dos veces (se lo
     hace otra aplicación que usa para llevar la facturación). Si ya hay
     una cita VIVA a esa misma hora, este evento es la copia: se descarta.
     Las canceladas no cuentan: se quedan en esa hora a propósito (lista
     de espera, rastro de facturas/WhatsApp) y no deben tapar una cita
     nueva que ocupe el mismo hueco que dejó libre la cancelada. */
  const { data: yaHayCita } = await admin
    .from('citas')
    .select('id')
    .eq('psicologa_id', psicologaId)
    .eq('fecha_hora', inicio.toISOString())
    .neq('estado_confirmacion', 'cancelada')
    .limit(1)
    .maybeSingle()
  if (yaHayCita) return

  const titulo = String(evento.summary ?? '').trim() || '(sin título)'

  /* Dos maneras de saber de quién es la cita:
       · el teléfono en el título, que ella escribe a mano;
       · el nombre dentro del paréntesis, cuando el paciente se ha
         reservado la hora él mismo desde la página de reservas. */
  const reserva = titulo.match(RESERVA)
  const { nombre, telefono } = reserva
    ? { nombre: limpiarNombre(reserva[1]), telefono: null }
    : datosDelTitulo(titulo)

  const esReservaConNombre = Boolean(reserva && nombre)

  // Ni teléfono ni reserva con nombre: no se inventa nada, a la bandeja
  if (!telefono && !esReservaConNombre) {
    await admin.from('eventos_google_pendientes').insert({
      psicologa_id: psicologaId,
      google_event_id: evento.id,
      titulo,
      inicio: inicio.toISOString(),
      duracion_minutos: duracion,
      // El ruido conocido entra ya ignorado, para no inundar la bandeja
      estado: esRuido(titulo) ? 'ignorado' : 'pendiente',
      nombre_detectado: nombre,
      telefono_detectado: null,
    })
    if (!esRuido(titulo)) resumen.pendientes++
    return
  }

  /* Buscar la ficha: por teléfono si lo hay, que es lo fiable, y sólo
     por nombre en las reservas, donde no hay otra cosa. */
  const { data: encontrado } = telefono
    ? await admin.rpc('paciente_por_telefono', {
        p_psicologa_id: psicologaId,
        p_telefono: telefono,
      })
    : await admin.rpc('paciente_por_nombre', {
        p_psicologa_id: psicologaId,
        p_nombre: nombre,
      })

  let pacienteId = encontrado ?? null

  if (!pacienteId) {
    const { data: nuevo, error } = await admin
      .from('pacientes')
      .insert({
        psicologa_id: psicologaId,
        nombre: nombre ?? 'Paciente sin nombre',
        telefono: telefono ?? null,
        creado_desde: 'google',
      })
      .select('id')
      .single()

    if (error || !nuevo) {
      console.error('[Psicofactur] no se ha podido crear el paciente:', error)
      return
    }
    pacienteId = nuevo.id
  }

  const { error: errorCita } = await admin.from('citas').insert({
    psicologa_id: psicologaId,
    paciente_id: pacienteId,
    fecha_hora: inicio.toISOString(),
    duracion_minutos: duracion,
    tipo: 'individual',
    google_event_id: evento.id,
    // Si Confirmafy ya había escrito el círculo, se respeta. El rojo ya
    // se ha descartado arriba, así que aquí sólo puede caer verde o
    // amarillo; sin círculo, «pendiente» como siempre.
    estado_confirmacion: estadoPorBola(evento.summary) ?? 'pendiente',
  })

  if (errorCita) {
    console.error('[Psicofactur] no se ha podido crear la cita importada:', errorCita)
    return
  }
  resumen.creadas++
}

/* --------------------- Una psicóloga --------------------- */

async function sincronizarUna(
  admin: SupabaseClient,
  psicologaId: string,
  completa: boolean,
): Promise<Resumen> {
  const resumen: Resumen = {
    psicologaId,
    revisados: 0,
    actualizados: 0,
    cancelados: 0,
    creadas: 0,
    pendientes: 0,
  }

  let token: string
  try {
    token = await accessTokenValido(admin, psicologaId)
  } catch (e) {
    resumen.aviso = e instanceof ErrorGoogle ? e.message : 'No se ha podido hablar con Google.'
    return resumen
  }

  const { data: credenciales } = await admin.rpc('google_leer_credenciales', {
    p_psicologa_id: psicologaId,
  })
  const cred = Array.isArray(credenciales) ? credenciales[0] : credenciales

  const { data: fila } = await admin
    .from('psicologas')
    .select('google_calendar_config')
    .eq('id', psicologaId)
    .single()
  const calendario = encodeURIComponent(fila?.google_calendar_config?.calendarId || 'primary')

  // `completa` = olvida por dónde ibas y repasa la agenda entera
  let syncToken: string | null = completa ? null : (cred?.sync_token ?? null)
  let pageToken: string | null = null
  let nuevoSyncToken: string | null = null
  let reintentoCompleto = false
  let cortadaPorTope = false

  for (let pagina = 0; pagina < 20; pagina++) {
    const p = new URLSearchParams({
      showDeleted: 'true',
      singleEvents: 'true',
      maxResults: '250',
    })

    if (syncToken) {
      // Con syncToken no se puede mandar timeMin: Google lo rechaza.
      // Los filtros de la primera pasada van dentro del propio token.
      p.set('syncToken', syncToken)
    } else {
      const desde = new Date(Date.now() - DIAS_ATRAS * 86400000)
      const hasta = new Date(Date.now() + DIAS_ADELANTE * 86400000)
      p.set('timeMin', desde.toISOString())
      p.set('timeMax', hasta.toISOString())
    }
    if (pageToken) p.set('pageToken', pageToken)

    const r = await fetch(`${API}/calendars/${calendario}/events?${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    // 410 = el syncToken ya no vale. Se tira y se repite entera.
    if (r.status === 410 && !reintentoCompleto) {
      reintentoCompleto = true
      syncToken = null
      pageToken = null
      continue
    }

    const datos = await r.json().catch(() => null)
    if (!r.ok) {
      console.error('[Psicofactur] events.list respondió', r.status, datos)
      resumen.aviso = 'Google Calendar no ha dejado consultar los cambios.'
      return resumen
    }

    for (const evento of datos.items ?? []) {
      await aplicarCambio(admin, psicologaId, evento, resumen)

      if (resumen.creadas + resumen.pendientes >= MAXIMO_POR_VUELTA) {
        cortadaPorTope = true
        break
      }
    }
    if (cortadaPorTope) break

    if (datos.nextPageToken) {
      pageToken = datos.nextPageToken
      continue
    }
    // El token para la próxima vez sólo viene en la última página
    nuevoSyncToken = datos.nextSyncToken ?? null
    break
  }

  /* Si se cortó por el tope NO se guarda el token: así la vuelta
     siguiente vuelve a pasar por todo y sigue donde lo dejó. Lo ya
     importado se salta solo, porque se busca por google_event_id. */
  if (cortadaPorTope) {
    resumen.parcial = true
  } else if (nuevoSyncToken && nuevoSyncToken !== cred?.sync_token) {
    await admin
      .from('google_credenciales')
      .update({ sync_token: nuevoSyncToken, updated_at: new Date().toISOString() })
      .eq('psicologa_id', psicologaId)
  }

  return resumen
}

/* ------------------------ Entrada ------------------------ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const cuerpo = await req.json().catch(() => ({}))
  const completa = Boolean(cuerpo?.completa)

  const admin = clienteAdmin()
  let psicologas: string[] = []
  let esCron = false

  if (rolDelToken(req) === 'service_role') {
    esCron = true
    const { data, error } = await admin
      .from('google_credenciales')
      .select('psicologa_id')
      .not('refresh_secret_id', 'is', null)

    if (error) {
      console.error('[Psicofactur] no se han podido listar las conexiones:', error)
      return json({ mensaje: 'No se han podido listar las conexiones.' }, 500)
    }
    psicologas = (data ?? []).map((f) => f.psicologa_id)
  } else {
    const id = await psicologaDeLaPeticion(req)
    if (!id) return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)
    psicologas = [id]
  }

  const resultados: Resumen[] = []
  for (const id of psicologas) {
    // La pasada completa sólo se pide a mano, nunca desde el cron
    resultados.push(await sincronizarUna(admin, id, completa && !esCron))
  }

  // Con una sola psicóloga (los botones de Ajustes) se contesta en
  // plano, que es lo que la pantalla sabe leer.
  if (resultados.length === 1) {
    const r = resultados[0]
    return json({
      actualizados: r.actualizados,
      cancelados: r.cancelados,
      creadas: r.creadas,
      pendientes: r.pendientes,
      parcial: Boolean(r.parcial),
      aviso: r.aviso ?? null,
    })
  }

  console.log('[Psicofactur] sincronización desde Google:', JSON.stringify(resultados))
  return json({ psicologas: resultados.length, resultados })
})

/** El `role` del token. La firma ya la ha comprobado la plataforma. */
function rolDelToken(req: Request): string | null {
  const cabecera = req.headers.get('Authorization') ?? ''
  const token = cabecera.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const carga = token.split('.')[1]
    const json = atob(carga.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)?.role ?? null
  } catch (_) {
    return null
  }
}
