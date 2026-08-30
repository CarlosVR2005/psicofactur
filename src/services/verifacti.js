import { supabase } from '../lib/supabase'
import { fallo } from './base'
import { normalizarNif } from '../lib/nif'

/* ================================================================
   FACTURACIÓN ELECTRÓNICA (Veri*Factu, vía Verifacti)

   Aquí NO hay ninguna llamada a Verifacti. Lo que hay son llamadas a
   las Edge Functions, que son las que hablan con ellos.

   El motivo es la API key: determina el NIF emisor y el entorno, así
   que quien la tenga puede registrar facturas a nombre de la consulta
   ante la AEAT. Si viajara al navegador, cualquiera que abriera las
   herramientas de desarrollo la tendría. Por eso vive como secreto de
   las Edge Functions:

     supabase secrets set VERIFACTI_API_KEY=...

   La pantalla llama a `emitirFactura()` y no sabe nada de lo que hay
   detrás, igual que con Google Calendar.
   ================================================================ */

/** Saca el mensaje que devolvió la Edge Function cuando responde con error. */
async function respuestaDeError(error) {
  try {
    const cuerpo = await error?.context?.json?.()
    if (cuerpo?.mensaje) return cuerpo
  } catch (_) {
    // La función ni siquiera respondió JSON
  }
  return null
}

/**
 * Emite la factura de una sesión: la registra en la AEAT y guarda el
 * resultado.
 *
 * Se le pasa `citaId` (la sesión que se factura) o `facturaId` (una
 * factura que ya existe y se quiere reintentar, porque el envío
 * anterior falló).
 *
 * Un detalle que conviene tener claro al pintar la pantalla: cuando
 * esto sale bien, la AEAT todavía no ha dicho que sí. Su registro se
 * encola y tarda alrededor de un minuto, así que el estado que vuelve
 * es «Pendiente» y no significa que haya ningún problema.
 *
 * @param {{citaId?: string, facturaId?: string, metodoPago?: string}} opciones
 * @returns {Promise<{data: object|null, error: {mensaje, tecnico, configuracionIncompleta?}|null}>}
 */
export async function emitirFactura({ citaId, facturaId, metodoPago } = {}) {
  if (!citaId && !facturaId) {
    return fallo(new Error('sin cita'), 'emitir la factura', 'No se sabe qué sesión facturar.')
  }

  const { data, error } = await supabase.functions.invoke('generar-factura', {
    body: {
      cita_id: citaId ?? null,
      factura_id: facturaId ?? null,
      metodo_pago: metodoPago ?? null,
    },
  })

  if (error) {
    const cuerpo = await respuestaDeError(error)
    const resultado = fallo(error, 'emitir la factura', cuerpo?.mensaje)

    /* Le faltan los datos fiscales. No es un error que se resuelva
       reintentando: la pantalla lo usa para llevarla a Ajustes en vez
       de dejarla mirando un aviso rojo. */
    if (cuerpo?.configuracion_incompleta) {
      resultado.error.configuracionIncompleta = true
      resultado.error.faltan = cuerpo.faltan ?? []
    }
    return resultado
  }

  return {
    data: {
      facturaId: data.factura_id,
      numero: data.numero_factura,
      importe: Number(data.importe ?? 0),
      estado: data.estado,
      verifactuId: data.verifactu_id,
      // URL de verificación de la AEAT: es lo que codifica el QR
      qrUrl: data.qr_url,
      // El QR ya dibujado, PNG en base64 listo para un <img src="data:…">
      qr: data.qr,
      huella: data.huella,
      yaEmitida: Boolean(data.ya_emitida),
      // Se reenvió una que Hacienda había rechazado, con el mismo número
      subsanada: Boolean(data.subsanada),
    },
    error: null,
  }
}

/**
 * RECTIFICA una factura: emite otra que la sustituye.
 *
 * Ojo a la diferencia, que es legal y no de matiz:
 *
 *   · Rectificar (esto) → la factura está bien emitida y Hacienda la
 *     aceptó, pero tiene un dato mal. NO se corrige: se emite una
 *     factura NUEVA, con su propio número de la serie «R», que la
 *     sustituye. La original queda anulada pero presente, porque su
 *     rastro en Hacienda no se puede borrar.
 *   · Subsanar → Hacienda rechazó el registro, así que la factura nunca
 *     llegó a constar. Se reenvía la misma. Va por `emitirFactura`.
 *
 * La original sólo se marca como anulada cuando la rectificativa ya
 * está registrada: al revés quedaría una factura anulada sin nada que
 * la sustituya.
 *
 * @param {{facturaId: string, importe: number, motivo: string}} datos
 */
export async function rectificarFactura({ facturaId, importe, motivo } = {}) {
  if (!facturaId) {
    return fallo(new Error('sin factura'), 'rectificar la factura', 'No se sabe qué factura rectificar.')
  }
  if (!String(motivo ?? '').trim()) {
    return fallo(
      new Error('sin motivo'),
      'rectificar la factura',
      'Hay que explicar por qué se rectifica la factura.',
    )
  }

  const { data, error } = await supabase.functions.invoke('generar-factura', {
    body: {
      factura_id: facturaId,
      rectificar: { importe: Number(importe), motivo: String(motivo).trim() },
    },
  })

  if (error) {
    const cuerpo = await respuestaDeError(error)
    return fallo(error, 'rectificar la factura', cuerpo?.mensaje)
  }

  return {
    data: {
      facturaId: data.factura_id,
      numero: data.numero_factura,
      importe: Number(data.importe ?? 0),
      estado: data.estado,
      verifactuId: data.verifactu_id,
      qrUrl: data.qr_url,
      qr: data.qr,
      huella: data.huella,
      rectificaA: data.factura_rectificada_id,
    },
    error: null,
  }
}

/**
 * Pregunta a Hacienda en qué han quedado las facturas que se enviaron y
 * siguen sin resolver, y actualiza las que ya tienen respuesta.
 *
 * Hace falta porque el «sí» de la emisión no es el «sí» de Hacienda: la
 * AEAT no admite envíos en tiempo real, así que acepta el registro en
 * cola y lo rechaza —si lo rechaza— alrededor de un minuto después. Sin
 * esta consulta, una factura rechazada se queda para siempre con cara
 * de estar bien.
 *
 * Se dispara al abrir Facturación. Es barata cuando no hay nada
 * pendiente: la función corta enseguida.
 *
 * @returns {Promise<{data: {revisadas, resueltas, rechazadas, problemas}|null, error}>}
 */
export async function sincronizarEstadoFacturas() {
  const { data, error } = await supabase.functions.invoke('sincronizar-estado-facturas')

  if (error) {
    const cuerpo = await respuestaDeError(error)
    return fallo(error, 'comprobar el estado de las facturas', cuerpo?.mensaje)
  }

  return {
    data: {
      revisadas: Number(data?.revisadas ?? 0),
      resueltas: Number(data?.resueltas ?? 0),
      rechazadas: Number(data?.rechazadas ?? 0),
      problemas: data?.problemas ?? [],
    },
    error: null,
  }
}

const CAMPOS_FISCALES = [
  ['nif', 'el NIF'],
  ['razon_social', 'el nombre fiscal'],
  ['direccion_fiscal', 'la dirección fiscal'],
]

/**
 * Los datos fiscales de la psicóloga: los que van IMPRESOS en la
 * factura del paciente.
 *
 * Ojo, que es contraintuitivo: estos datos no se le mandan a Verifacti.
 * Allí el emisor lo determina la propia API key. Aquí hacen falta
 * porque el documento en papel sí tiene que llevarlos.
 *
 * @returns {Promise<{data: {nif, razonSocial, direccionFiscal, faltan: string[], completo: boolean}|null, error}>}
 */
export async function getDatosFiscales() {
  const { data: sesion } = await supabase.auth.getUser()
  const id = sesion?.user?.id
  if (!id) {
    return fallo(new Error('sin sesión'), 'comprobar tus datos de facturación')
  }

  const { data, error } = await supabase
    .from('psicologas')
    .select('nif, razon_social, direccion_fiscal, iban, logo, verifactu_config, verifactu_activo')
    .eq('id', id)
    .single()

  if (error) return fallo(error, 'comprobar tus datos de facturación')

  const faltan = CAMPOS_FISCALES.filter(
    ([campo]) => !String(data?.[campo] ?? '').trim(),
  ).map(([, nombre]) => nombre)

  return {
    data: {
      nif: data?.nif ?? '',
      razonSocial: data?.razon_social ?? '',
      direccionFiscal: data?.direccion_fiscal ?? '',
      // El IBAN tampoco cuenta para `completo`: si está, sale en la
      // factura como forma de pago; si no, no se muestra ese bloque
      iban: data?.iban ?? '',
      // El logo NO cuenta para `completo`: es opcional, la factura vale igual
      logo: data?.logo ?? null,
      // Consulta en Canarias: el PDF cita la exención de IGIC, no de IVA
      regimenCanarias: data?.verifactu_config?.regimenCanarias === true,
      /* false = las facturas se cierran en local, sin AEAT ni QR (migración
         0028). La pantalla lo usa para elegir qué hace «Emitir». */
      verifactuActivo: data?.verifactu_activo === true,
      faltan,
      completo: faltan.length === 0,
    },
    error: null,
  }
}

/**
 * Guarda los datos fiscales que van impresos en la factura.
 *
 * El NIF se guarda normalizado —sin espacios ni guiones y en
 * mayúsculas— porque es como lo espera la AEAT, y así da igual cómo lo
 * escriba quien rellena el formulario.
 *
 * El IBAN se guarda sin espacios y en mayúsculas, que es como lo
 * espera el CHECK de la base y como se compara un número de cuenta.
 *
 * @param {{nif: string, razonSocial: string, direccionFiscal: string, iban?: string}} datos
 */
export async function guardarDatosFiscales({ nif, razonSocial, direccionFiscal, iban }) {
  const { data: sesion } = await supabase.auth.getUser()
  const id = sesion?.user?.id
  if (!id) {
    return fallo(new Error('sin sesión'), 'guardar tus datos de facturación')
  }

  const { data, error } = await supabase
    .from('psicologas')
    .update({
      nif: normalizarNif(nif) || null,
      razon_social: String(razonSocial ?? '').trim() || null,
      direccion_fiscal: String(direccionFiscal ?? '').trim() || null,
      iban: String(iban ?? '').replace(/\s+/g, '').toUpperCase() || null,
    })
    .eq('id', id)
    .select('nif, razon_social, direccion_fiscal, iban')
    .single()

  if (error) {
    /* 23514 = el CHECK psicologas_iban_razonable de la migración 0026. */
    const mensaje =
      error.code === '23514'
        ? 'Ese número de cuenta no parece un IBAN válido. Revísalo (empieza por dos letras del país, p. ej. ES).'
        : undefined
    return fallo(error, 'guardar tus datos de facturación', mensaje)
  }

  return {
    data: {
      nif: data.nif ?? '',
      razonSocial: data.razon_social ?? '',
      direccionFiscal: data.direccion_fiscal ?? '',
      iban: data.iban ?? '',
    },
    error: null,
  }
}

/**
 * Guarda o quita el logo de la consulta.
 *
 * Va aparte del formulario de datos fiscales porque es otra
 * interacción: se elige un fichero y se ve el resultado al momento, sin
 * tener que acordarse de pulsar Guardar.
 *
 * @param {string|null} dataUrl  el PNG ya reescalado, o null para quitarlo
 */
export async function guardarLogo(dataUrl) {
  const { data: sesion } = await supabase.auth.getUser()
  const id = sesion?.user?.id
  if (!id) return fallo(new Error('sin sesión'), 'guardar el logo')

  const { data, error } = await supabase
    .from('psicologas')
    .update({ logo: dataUrl })
    .eq('id', id)
    .select('logo')
    .single()

  if (error) {
    /* 23514 = el CHECK de la migración 0014. Sólo puede saltar si algo
       se ha saltado el reescalado de la pantalla. */
    const mensaje =
      error.code === '23514'
        ? 'Esa imagen es demasiado grande para guardarla. Prueba con una más pequeña.'
        : undefined
    return fallo(error, 'guardar el logo', mensaje)
  }

  return { data: data.logo ?? null, error: null }
}

/**
 * Si la psicóloga puede facturar o le falta algún dato fiscal.
 * Sirve para avisar ANTES de que pulse Emitir.
 * @returns {Promise<{data: {puede: boolean, faltan: string[]}|null, error}>}
 */
export async function comprobarDatosFiscales() {
  const { data, error } = await getDatosFiscales()
  if (error) return { data: null, error }
  return { data: { puede: data.completo, faltan: data.faltan }, error: null }
}
