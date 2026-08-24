/* ================================================================
   sincronizar-estado-facturas

   Pregunta a Verifacti en qué han quedado las facturas que se enviaron
   y todavía están en el aire.

   Por qué hace falta una función aparte: la AEAT no admite envíos en
   tiempo real. `generar-factura` sólo puede dejar la factura encolada,
   y la respuesta de creación SIEMPRE dice «Pendiente» aunque los datos
   estén mal. El rechazo llega después.

   Sin esto, una factura que Hacienda ha rechazado se queda en la
   pantalla como «Enviando…» para siempre y la psicóloga cree que está
   presentada. Pasó de verdad la primera vez que se probó: el DNI de una
   paciente tenía la letra cambiada, la AEAT la rechazó al minuto y en
   la app no se notaba nada.

   La dispara el navegador al abrir Facturación, igual que la
   sincronización de Google: así el fallo se ve en pantalla en vez de
   morirse en un log.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteDeUsuaria, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import { consultarEstadoFactura, verifactiConfigurado } from '../_shared/verifacti.ts'

/* Un tope por llamada: si algún día hay muchas atascadas, es preferible
   ir resolviéndolas en varias pasadas a que la función se quede sin
   tiempo y no actualice ninguna. */
const MAXIMO_POR_PASADA = 25

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const psicologaId = await psicologaDeLaPeticion(req)
  if (!psicologaId) {
    return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)
  }

  if (!verifactiConfigurado()) {
    // Sin configurar no es un error: simplemente no hay nada que mirar
    return json({ revisadas: 0, resueltas: 0, rechazadas: 0 })
  }

  const db = clienteDeUsuaria(req)

  const { data: pendientes, error } = await db
    .from('facturas')
    .select('id, numero_factura, verifactu_id')
    .eq('verifactu_estado', 'Pendiente')
    .not('verifactu_id', 'is', null)
    .order('verifactu_enviada_at', { ascending: true })
    .limit(MAXIMO_POR_PASADA)

  if (error) {
    return json({ mensaje: 'No se han podido leer las facturas pendientes.' }, 500)
  }

  if (!pendientes || pendientes.length === 0) {
    return json({ revisadas: 0, resueltas: 0, rechazadas: 0 })
  }

  let resueltas = 0
  let rechazadas = 0
  const problemas: Array<{ numero: string; motivo: string }> = []

  for (const factura of pendientes) {
    let estado
    try {
      estado = await consultarEstadoFactura(factura.verifactu_id as string)
    } catch (e) {
      /* Que falle la consulta de UNA no puede tumbar la pasada entera:
         la factura sigue en «Pendiente» y se reintenta la próxima vez. */
      console.error(`[Psicofactur] no se pudo consultar ${factura.numero_factura}:`, e)
      continue
    }

    // Sigue encolada: se deja como está y se volverá a mirar
    if (!estado?.estado || estado.estado === 'Pendiente') continue

    const rechazada = estado.estado !== 'Correcto'
    const motivo = [estado.codigo_error, estado.mensaje_error]
      .filter(Boolean)
      .join(' · ')

    const { error: errorGuardar } = await db
      .from('facturas')
      .update({
        verifactu_estado: estado.estado,
        verifactu_error: rechazada ? motivo || estado.estado : null,
      })
      .eq('id', factura.id)

    if (errorGuardar) {
      console.error(`[Psicofactur] no se pudo guardar ${factura.numero_factura}:`, errorGuardar)
      continue
    }

    if (rechazada) {
      rechazadas += 1
      problemas.push({
        numero: String(factura.numero_factura),
        motivo: motivo || estado.estado,
      })
    } else {
      resueltas += 1
    }
  }

  return json({
    revisadas: pendientes.length,
    resueltas,
    rechazadas,
    problemas,
  })
})
