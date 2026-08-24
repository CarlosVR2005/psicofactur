import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo, psicologaActualId } from './base'
import { aClave, fechaLarga, hoy, sumarDias } from '../lib/fechas'

/* ================================================================
   RECORDATORIOS DE WHATSAPP

   Dos tablas en juego:

   · `citas.estado_confirmacion` — el estado que se pinta (pendiente /
     confirmada / cancelada). El frontend SÓLO LO LEE. Lo escribe el
     trigger `sync_estado_confirmacion` cuando llega la respuesta del
     paciente a `recordatorios_whatsapp.boton_pulsado`.

   · `recordatorios_whatsapp` — el histórico de envíos. Aquí sí se
     inserta: cada vez que se manda un recordatorio queda registrado.

   Y hay un tercer camino que no pasa por aquí: la Edge Function
   `enviar-recordatorios-automaticos`, que el cron dispara cada hora y
   manda solo el recordatorio de las citas que están a 24 h. Esas filas
   llegan a esta pantalla igual que las demás, con `origen` =
   'automatico'.

   «Enviar» hace una de dos cosas según los ajustes:

   · Con la API de WhatsApp Business activada, la Edge Function
     `enviar-recordatorio-whatsapp` manda la plantilla aprobada y anota
     el envío con el id de mensaje de Meta. La respuesta del paciente
     entra sola por el webhook.
   · Sin ella, se abre WhatsApp con el mensaje escrito para mandarlo a
     mano y se anota el envío igual. Es lo que había y sigue siendo el
     plan B si Meta falla.
   ================================================================ */

const COLUMNAS = `
  id, fecha_hora, tipo, estado_confirmacion, notas, paciente_id, acompanante_id,
  paciente:pacientes!citas_paciente_id_fkey (id, nombre, telefono),
  acompanante:pacientes!citas_acompanante_id_fkey (id, nombre),
  recordatorios:recordatorios_whatsapp!recordatorios_whatsapp_cita_id_fkey (
    id, enviado_at, estado_envio, whatsapp_message_id, boton_pulsado, respondido_at, origen
  )
`

function deFila(fila) {
  const f = new Date(fila.fecha_hora)
  const dos = (n) => String(n).padStart(2, '0')

  // El último recordatorio enviado es el que cuenta
  const historico = [...(fila.recordatorios ?? [])].sort((a, b) =>
    String(b.enviado_at).localeCompare(String(a.enviado_at)),
  )
  const ultimo = historico[0] ?? null

  return {
    id: fila.id,
    fecha: aClave(f),
    hora: `${dos(f.getHours())}:${dos(f.getMinutes())}`,
    tipo: fila.tipo,
    notas: fila.notas ?? '',
    pacienteId: fila.paciente_id,
    pacienteNombre: fila.paciente?.nombre ?? 'Paciente',
    pacienteTelefono: fila.paciente?.telefono ?? '',
    acompananteNombre: fila.acompanante?.nombre ?? null,
    // Sólo lectura
    confirmacion: fila.estado_confirmacion,
    // «Sin enviar» no es un estado de la base: es no tener recordatorio
    enviado: Boolean(ultimo),
    recordatorioId: ultimo?.id ?? null,
    envios: historico.length,
    enviadoAt: ultimo?.enviado_at ?? null,
    estadoEnvio: ultimo?.estado_envio ?? null,
    respondidoAt: ultimo?.respondido_at ?? null,
    botonPulsado: ultimo?.boton_pulsado ?? null,
    // 'manual' (lo mandó ella) o 'automatico' (lo mandó el cron)
    origen: ultimo?.origen ?? null,
  }
}

/** Próximas citas con su recordatorio, para el panel */
export async function getProximasConRecordatorio(dias = 7) {
  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  const hasta = sumarDias(hoy(), dias)
  hasta.setHours(23, 59, 59, 999)

  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .select(COLUMNAS)
      .gte('fecha_hora', desde.toISOString())
      .lte('fecha_hora', hasta.toISOString())
      .order('fecha_hora'),
    'cargar los recordatorios',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/** Texto del recordatorio que se manda al paciente */
export function mensajeRecordatorio(cita) {
  const nombreCorto = cita.pacienteNombre.split(' ')[0]
  const cuando = fechaLarga(new Date(`${cita.fecha}T00:00:00`))
  return (
    `Hola ${nombreCorto}, te recuerdo tu cita del ${cuando} a las ${cita.hora}. ` +
    `¿Me confirmas que podrás venir? Un saludo.`
  )
}

/** Enlace que abre WhatsApp con el mensaje ya escrito */
export function enlaceWhatsApp(cita) {
  const telefono = String(cita.pacienteTelefono ?? '').replace(/\D/g, '')
  const numero = telefono.startsWith('34') ? telefono : `34${telefono}`
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeRecordatorio(cita))}`
}

/**
 * Manda el recordatorio de verdad por la API de WhatsApp Business.
 *
 * El navegador sólo dice qué cita: el teléfono y el texto los pone la
 * Edge Function leyendo la base, y el envío queda anotado allí con el
 * id de mensaje de Meta (que es lo que luego permite al webhook casar
 * la respuesta del paciente con esta cita).
 *
 * @returns {{data: {registro}|null, error}}
 */
export async function enviarPorWhatsApp(cita) {
  const { data, error } = await supabase.functions.invoke('enviar-recordatorio-whatsapp', {
    body: { citaId: cita.id },
  })

  if (error) {
    let mensaje = null
    try {
      mensaje = (await error?.context?.json?.())?.mensaje ?? null
    } catch (_) {
      // la función no contestó JSON
    }
    return fallo(error, 'enviar el recordatorio por WhatsApp', mensaje)
  }

  // Meta ha rechazado el envío: el motivo ya viene escrito para pantalla
  if (data?.aviso) {
    return { data: null, error: { mensaje: data.aviso, tecnico: data } }
  }

  return exito(data?.registro ?? null)
}

/** ¿Tiene el servidor los secretos de WhatsApp puestos? */
export async function comprobarWhatsApp() {
  const { data, error } = await supabase.functions.invoke('enviar-recordatorio-whatsapp', {
    body: { comprobar: true },
  })
  if (error) return fallo(error, 'comprobar la conexión con WhatsApp')
  return exito({ configurado: Boolean(data?.configurado), falta: data?.falta ?? [] })
}

/**
 * Deja constancia de que el recordatorio se ha mandado.
 * No toca `estado_confirmacion`: eso sólo lo cambia la respuesta del
 * paciente a través del trigger.
 *
 * Sólo se usa en el modo manual (abrir WhatsApp a mano): cuando manda la
 * API, la fila la escribe la Edge Function, que es quien tiene el id de
 * mensaje de Meta.
 */
export async function registrarEnvio(cita) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(new Error('sin sesión'), 'registrar el envío: la sesión ha caducado')
  }

  const { data, error } = await ejecutar(
    supabase
      .from('recordatorios_whatsapp')
      .insert({
        psicologa_id: psicologaId,
        cita_id: cita.id,
        estado_envio: 'enviado',
      })
      .select('id, enviado_at, estado_envio')
      .single(),
    'registrar el envío del recordatorio',
  )
  if (error) return { data: null, error }
  return exito(data)
}

/**
 * Anota la respuesta que el paciente ha dado por WhatsApp.
 *
 * Escribe `boton_pulsado` —el mismo camino que usará el webhook— y es el
 * trigger `sync_estado_confirmacion` quien cambia el estado de la cita.
 * Aquí NO se toca `citas.estado_confirmacion`.
 *
 * @param cita  la cita del panel
 * @param boton 'confirmo' | 'no_puedo'  (constantes en lib/tipos.js)
 */
export async function marcarRespuesta(cita, boton) {
  let recordatorioId = cita.recordatorioId

  // El trigger es AFTER UPDATE: si nunca se envió recordatorio, primero
  // hay que crear la fila del histórico y luego actualizarla.
  if (!recordatorioId) {
    const { data, error } = await registrarEnvio(cita)
    if (error) return { data: null, error }
    recordatorioId = data.id
  }

  const { data, error } = await ejecutar(
    supabase
      .from('recordatorios_whatsapp')
      .update({
        boton_pulsado: boton,
        respondido_at: new Date().toISOString(),
        estado_envio: 'respondido',
      })
      .eq('id', recordatorioId)
      .select('id, enviado_at, estado_envio, boton_pulsado, respondido_at')
      .single(),
    'guardar la respuesta del paciente',
  )
  if (error) return { data: null, error }

  return exito({
    ...data,
    // Lo que el trigger acaba de dejar en la cita
    confirmacion: boton === 'confirmo' ? 'confirmada' : 'cancelada',
  })
}
