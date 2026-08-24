/* ================================================================
   enviar-recordatorios-automaticos

   El recordatorio que sale solo: cada hora se mira qué citas caen
   dentro de la ventana de antelación (24 h por defecto, ajustable en
   Ajustes) y se manda el mensaje a esos pacientes.

   Se dispara de dos formas, igual que el sondeo de Google:

   · el cron cada hora, con la clave de servicio → todas las consultas
     que tengan el envío automático encendido.
   · desde la app con la sesión de ella → sólo la suya. Manda de verdad:
     es la forma de probar que la cadena entera funciona.

   POR QUÉ UNA VENTANA Y NO «LAS DE MAÑANA»
   La ventana va de `horasAntes - 1 h` a `horasAntes`, o sea una hora de
   ancho, la misma que separa dos vueltas del cron. Así cada cita entra
   en una única vuelta y nadie recibe el aviso con doce horas de más
   porque su cita fuera a primera hora.

   Y si una vuelta se pierde (la función caída, Meta caído), esa cita ya
   no vuelve a entrar en la ventana: es el precio de no arriesgarse a
   avisar dos veces. En la pantalla de Recordatorios se ve enseguida,
   porque sigue diciendo «Sin enviar» y el botón Enviar está ahí.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import {
  COLUMNAS_CITA,
  configDeLaConsulta,
  enviarRecordatorio,
  type CitaParaRecordatorio,
} from '../_shared/recordatorio.ts'
import { queFaltaPorConfigurar, whatsappConfigurado } from '../_shared/whatsapp.ts'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/* Tope por vuelta y por consulta. Una hora de agenda no da para tanto,
   así que llegar al tope significa que algo va mal (una importación
   masiva, un cron parado días); mejor que se note en el log a que se
   vacíe el saldo de Meta en una sola vuelta. */
const MAXIMO_POR_VUELTA = 50

interface Resumen {
  psicologaId: string
  candidatas: number
  enviados: number
  fallidos: number
  omitidos: number
  aviso?: string
}

/* ------------------- Una consulta ------------------- */

async function recordarUna(admin: SupabaseClient, psicologaId: string): Promise<Resumen> {
  const resumen: Resumen = { psicologaId, candidatas: 0, enviados: 0, fallidos: 0, omitidos: 0 }

  const config = await configDeLaConsulta(admin, psicologaId)
  if (!config.activo) {
    resumen.aviso = 'El envío automático está apagado en Ajustes.'
    return resumen
  }

  /* La ventana: entre `horasAntes - 1` y `horasAntes` a partir de ahora. */
  const ahora = Date.now()
  const hasta = new Date(ahora + config.horasAntes * 3_600_000)
  const desde = new Date(ahora + (config.horasAntes - 1) * 3_600_000)

  const { data: citas, error } = await admin
    .from('citas')
    .select(COLUMNAS_CITA)
    .eq('psicologa_id', psicologaId)
    // Ya confirmada o ya cancelada: no hay nada que preguntar
    .eq('estado_confirmacion', 'pendiente')
    .gte('fecha_hora', desde.toISOString())
    .lt('fecha_hora', hasta.toISOString())
    .order('fecha_hora')
    .limit(MAXIMO_POR_VUELTA)

  if (error) {
    console.error('[Psicofactur] no se han podido leer las citas de la ventana:', error)
    resumen.aviso = 'No se han podido leer las citas.'
    return resumen
  }

  const candidatas = (citas ?? []) as unknown as CitaParaRecordatorio[]
  resumen.candidatas = candidatas.length
  if (candidatas.length === 0) return resumen

  /* Las que ya tienen recordatorio automático se descartan aquí, para
     no llamar a Meta en vano. El que impide de verdad el duplicado es
     el índice único de la tabla (ver `_shared/recordatorio.ts`): esto
     es sólo por no gastar llamadas. */
  const { data: yaAvisadas } = await admin
    .from('recordatorios_whatsapp')
    .select('cita_id')
    .eq('origen', 'automatico')
    .in(
      'cita_id',
      candidatas.map((c) => c.id),
    )

  const hechas = new Set((yaAvisadas ?? []).map((f) => f.cita_id))

  for (const cita of candidatas) {
    if (hechas.has(cita.id)) {
      resumen.omitidos++
      continue
    }

    const resultado = await enviarRecordatorio(admin, {
      psicologaId,
      cita,
      config,
      origen: 'automatico',
    })

    if (resultado.duplicado) resumen.omitidos++
    else if (resultado.enviado) resumen.enviados++
    else {
      resumen.fallidos++
      console.error(
        `[Psicofactur] recordatorio automático fallido (cita ${cita.id}):`,
        resultado.aviso,
      )
    }
  }

  if (resumen.candidatas === MAXIMO_POR_VUELTA) {
    console.warn(
      `[Psicofactur] tope de ${MAXIMO_POR_VUELTA} recordatorios en una vuelta (psicóloga ${psicologaId}). Revisar la agenda.`,
    )
  }

  return resumen
}

/* ---------------------- Entrada ---------------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  if (!whatsappConfigurado()) {
    /* Sin secretos no se manda nada, pero se contesta 200: si el cron
       recibiera un error se pondría a reintentar sin sentido. */
    console.warn('[Psicofactur] WhatsApp sin configurar:', queFaltaPorConfigurar().join(', '))
    return json({
      enviados: 0,
      aviso: 'WhatsApp no está configurado en el servidor. Faltan: ' +
        queFaltaPorConfigurar().join(', '),
    })
  }

  const admin = clienteAdmin()
  let psicologas: string[] = []

  if (rolDelToken(req) === 'service_role') {
    const { data, error } = await admin
      .from('psicologas')
      .select('id')
      .eq('whatsapp_config->>activo', 'true')

    if (error) {
      console.error('[Psicofactur] no se han podido listar las consultas:', error)
      return json({ mensaje: 'No se han podido listar las consultas.' }, 500)
    }
    psicologas = (data ?? []).map((f) => f.id)
  } else {
    const id = await psicologaDeLaPeticion(req)
    if (!id) return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)
    psicologas = [id]
  }

  const resultados: Resumen[] = []
  for (const id of psicologas) {
    resultados.push(await recordarUna(admin, id))
  }

  const total = resultados.reduce(
    (suma, r) => ({
      enviados: suma.enviados + r.enviados,
      fallidos: suma.fallidos + r.fallidos,
      omitidos: suma.omitidos + r.omitidos,
    }),
    { enviados: 0, fallidos: 0, omitidos: 0 },
  )

  if (total.enviados || total.fallidos) {
    console.log('[Psicofactur] recordatorios automáticos:', JSON.stringify(total))
  }

  // Con una sola consulta se contesta en plano, que es lo que lee la app
  if (resultados.length === 1) return json(resultados[0])
  return json({ ...total, consultas: resultados.length, detalle: resultados })
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
