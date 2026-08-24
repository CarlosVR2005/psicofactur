import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo, psicologaActualId } from './base'
import { aClave, hoy } from '../lib/fechas'

/* ================================================================
   FACTURAS — tabla `facturas`

   Una factura por sesión: la base lo impone con el índice único
   `idx_facturas_cita_unica`, así que una misma cita no se puede
   facturar dos veces.

   El `numero_factura` NO se pone aquí: lo asigna el trigger
   `asignar_numero_factura()` leyendo el contador por psicóloga, año y
   serie. Así es imposible que salgan dos facturas con el mismo número.

   Crear la fila NO es emitir la factura. Esto sólo la apunta en casa;
   registrarla en la AEAT es otra cosa y la hace `services/verifacti.js`
   a través de la Edge Function. Mientras `verifactu_id` esté vacío, la
   factura existe aquí pero Hacienda no sabe nada de ella.
   ================================================================ */

const COLUMNAS = `
  id, numero_factura, importe, fecha_emision, estado_pago, fecha_pago,
  paciente_id, cita_id, metodo_pago, tipo_factura, factura_rectificada_id,
  motivo_rectificacion,
  verifactu_id, verifactu_estado, verifactu_error, verifactu_qr_url, verifactu_hash,
  email_enviado_at, email_destinatario,
  paciente:pacientes (id, nombre, dni, correo),
  cita:citas (id, fecha_hora, tipo),
  rectificada:facturas!factura_rectificada_id (numero_factura)
`

/* `facturas` se referencia a sí misma, y para eso PostgREST quiere como
   pista el nombre de la COLUMNA (`factura_rectificada_id`), no el de la
   clave ajena. Con el nombre del FK responde PGRST200 y se cae la
   consulta entera —no sólo el embed—, que es como se quedó la pantalla
   de facturación en blanco.

   El resultado se lee tolerando las dos formas: PostgREST devuelve un
   objeto cuando resuelve la relación como «muchos a uno», pero según
   cómo interprete la autorreferencia podría devolver una lista de un
   elemento. */
function numeroDeLaRectificada(fila) {
  const r = Array.isArray(fila.rectificada) ? fila.rectificada[0] : fila.rectificada
  return r?.numero_factura ?? null
}

function deFila(fila) {
  const sesion = fila.cita?.fecha_hora ? new Date(fila.cita.fecha_hora) : null
  return {
    id: fila.id,
    numero: fila.numero_factura ?? '—',
    pacienteId: fila.paciente_id,
    pacienteNombre: fila.paciente?.nombre ?? 'Paciente',
    // Hace falta para el PDF: sin DNI la factura salió simplificada
    pacienteDni: fila.paciente?.dni ?? null,
    // A dónde se le manda la factura. Vacío = no tiene correo en su ficha
    pacienteCorreo: fila.paciente?.correo ?? '',
    citaId: fila.cita_id,
    fechaSesion: sesion ? aClave(sesion) : null,
    horaSesion: sesion
      ? `${String(sesion.getHours()).padStart(2, '0')}:${String(sesion.getMinutes()).padStart(2, '0')}`
      : null,
    tipoSesion: fila.cita?.tipo ?? null,
    importe: Number(fila.importe ?? 0),
    fechaEmision: fila.fecha_emision,
    // La contabilidad se agrupa por mes de emisión
    mes: fila.fecha_emision.slice(0, 7),
    estado: fila.estado_pago,
    fechaPago: fila.fecha_pago,
    metodoPago: fila.metodo_pago,
    tipo: fila.tipo_factura ?? 'normal',
    rectificaA: fila.factura_rectificada_id,
    numeroRectificada: numeroDeLaRectificada(fila),
    motivoRectificacion: fila.motivo_rectificacion,

    /* Estado ante Hacienda. Son situaciones muy distintas y la pantalla
       las pinta distinto:
         · null         → existe aquí, la AEAT no la conoce
         · 'error'      → ni se llegó a enviar; se reintenta y ya está
         · 'Pendiente'  → enviada y encolada, la AEAT tarda ~1 minuto
         · 'Correcto'   → aceptada
         · 'Incorrecto' → la AEAT la RECHAZÓ. Ojo: esto llega después de
                          decir que sí, así que sin consultar el estado
                          no se nota. Ver `sincronizarEstadoFacturas`. */
    /* Cuándo y a qué dirección se le mandó al paciente. La dirección se
       guarda tal como estaba ese día: si luego cambia su correo en la
       ficha, esto tiene que seguir diciendo adónde fue de verdad. */
    emailEnviadoEn: fila.email_enviado_at,
    emailDestinatario: fila.email_destinatario ?? '',

    emitida: Boolean(fila.verifactu_id),
    verifactuId: fila.verifactu_id,
    verifactuEstado: fila.verifactu_estado,
    verifactuError: fila.verifactu_error,
    qrUrl: fila.verifactu_qr_url,
    huella: fila.verifactu_hash,
  }
}

/** Todas las facturas, de la más reciente a la más antigua */
export async function getFacturas() {
  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .select(COLUMNAS)
      .order('fecha_emision', { ascending: false })
      .order('numero_factura', { ascending: false }),
    'cargar las facturas',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

export async function getFacturasDePaciente(pacienteId) {
  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .select(COLUMNAS)
      .eq('paciente_id', pacienteId)
      .order('fecha_emision', { ascending: false }),
    'cargar las facturas del paciente',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/**
 * Sesiones ya celebradas que todavía no tienen factura.
 * Es lo que cuenta el botón «Facturar» de cada paciente.
 * Las citas canceladas no se facturan.
 */
export async function getSesionesSinFacturar() {
  // Hasta el final del día de hoy: una sesión de esta tarde ya se puede
  // facturar por la mañana, pero las de mañana en adelante no.
  const finDeHoy = new Date()
  finDeHoy.setHours(23, 59, 59, 999)

  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .select(
        `id, fecha_hora, tipo, paciente_id,
         paciente:pacientes!citas_paciente_id_fkey (id, nombre, precio_sesion),
         factura:facturas!facturas_cita_id_fkey (id)`,
      )
      .lte('fecha_hora', finDeHoy.toISOString())
      .neq('estado_confirmacion', 'cancelada')
      .is('factura', null)
      .order('fecha_hora'),
    'buscar las sesiones sin facturar',
  )
  if (error) return { data: null, error }

  return exito(
    data.map((c) => {
      const f = new Date(c.fecha_hora)
      return {
        citaId: c.id,
        pacienteId: c.paciente_id,
        pacienteNombre: c.paciente?.nombre ?? 'Paciente',
        precioSesion: Number(c.paciente?.precio_sesion ?? 0),
        fecha: aClave(f),
        hora: `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`,
        tipo: c.tipo,
      }
    }),
  )
}

/**
 * Emite la factura de UNA sesión.
 * En las sesiones de pareja se factura al paciente titular.
 */
export async function facturarSesion(sesion) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(new Error('sin sesión'), 'generar la factura: la sesión ha caducado')
  }

  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .insert({
        psicologa_id: psicologaId,
        paciente_id: sesion.pacienteId,
        cita_id: sesion.citaId,
        importe: sesion.precioSesion,
        fecha_emision: aClave(hoy()),
        estado_pago: 'pendiente',
        // numero_factura lo pone el trigger de la base de datos
      })
      .select(COLUMNAS)
      .single(),
    'generar la factura',
  )

  if (error) {
    // 23505 sobre idx_facturas_cita_unica = esa sesión ya estaba facturada
    if (error.tecnico?.code === '23505') {
      return {
        data: null,
        error: {
          mensaje: 'Esa sesión ya tiene factura. Actualiza la pantalla para verla.',
          tecnico: error.tecnico,
        },
      }
    }
    return { data: null, error }
  }
  return exito(deFila(data))
}

/** Pendiente ↔ Pagado, o anulada */
export async function cambiarEstadoPago(id, estado) {
  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .update({
        estado_pago: estado,
        fecha_pago: estado === 'pagado' ? aClave(hoy()) : null,
      })
      .eq('id', id)
      .select(COLUMNAS)
      .single(),
    'cambiar el estado de la factura',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}
