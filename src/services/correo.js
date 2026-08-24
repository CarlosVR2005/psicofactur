import { supabase } from '../lib/supabase'
import { fallo } from './base'

/* ================================================================
   CORREO AL PACIENTE

   Como con Verifacti y con Google, aquí no hay ninguna llamada al
   proveedor de correo: se llama a la Edge Function `enviar-factura-email`
   y es ella la que habla con Brevo, con la clave a buen recaudo.

   La dirección de destino NO se manda desde aquí. La lee la Edge
   Function de la ficha del paciente, para que el navegador no pueda
   pedir que se mande una factura a una dirección cualquiera.
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
 * Le manda al paciente su factura en PDF.
 *
 * @param {{facturaId: string, pdfBase64: string, nombreFichero?: string}} datos
 * @returns {Promise<{data: {destinatario, enviadaEn}|null, error: {mensaje, tecnico, sinEmail?}|null}>}
 */
export async function enviarFacturaPorEmail({ facturaId, pdfBase64, nombreFichero }) {
  if (!facturaId || !pdfBase64) {
    return fallo(
      new Error('faltan datos'),
      'enviar la factura',
      'No se ha podido preparar la factura para enviarla.',
    )
  }

  const { data, error } = await supabase.functions.invoke('enviar-factura-email', {
    body: {
      factura_id: facturaId,
      pdf_base64: pdfBase64,
      nombre_fichero: nombreFichero ?? null,
    },
  })

  if (error) {
    const cuerpo = await respuestaDeError(error)
    const resultado = fallo(error, 'enviar la factura por correo', cuerpo?.mensaje)

    /* El paciente no tiene correo en su ficha. No se arregla
       reintentando, así que la pantalla lo usa para llevarla a la ficha
       en vez de dejarla mirando un aviso rojo. */
    if (cuerpo?.sin_email) resultado.error.sinEmail = true
    if (cuerpo?.configuracion_incompleta) resultado.error.configuracionIncompleta = true

    return resultado
  }

  return {
    data: {
      destinatario: data?.destinatario ?? '',
      enviadaEn: data?.enviada_at ?? new Date().toISOString(),
    },
    error: null,
  }
}
