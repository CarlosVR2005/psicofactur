import { getDatosFiscales } from '../../services/verifacti'
import { TIPOS_CITA } from '../../lib/tipos'

/* ================================================================
   Lo que hay que reunir para dibujar el PDF de una factura.

   Vive aquí y no dentro de un botón porque hay DOS sitios que generan
   ese PDF —«Descargar» y «Enviar por correo»— y tienen que producir el
   mismo documento, byte por byte. Si cada uno compusiera el concepto o
   la exención por su cuenta, el día que se tocara uno, el paciente
   recibiría por correo una factura distinta de la que ella se
   descarga. Y es un documento legal.
   ================================================================ */

/**
 * Reúne emisor, destinatario y datos de la factura listos para
 * `construirFacturaPDF`.
 *
 * @returns {Promise<{data: object|null, error: {mensaje: string}|null}>}
 */
export async function prepararFacturaPDF(factura) {
  const { data: emisor, error } = await getDatosFiscales()

  if (error || !emisor?.completo) {
    return {
      data: null,
      error: {
        mensaje:
          error?.mensaje ??
          `Para poder generar la factura falta ${emisor?.faltan?.join(' y ')} en Ajustes.`,
      },
    }
  }

  /* El concepto tiene que decir lo mismo que se le mandó a la AEAT como
     `descripcion`, que se compone igual en la Edge Function. */
  const etiqueta =
    TIPOS_CITA[factura.tipoSesion]?.descripcionFactura ?? 'Sesión de psicoterapia'
  const descripcion = factura.fechaSesion
    ? `${etiqueta} del ${factura.fechaSesion.split('-').reverse().join('/')}`
    : etiqueta

  return {
    data: {
      factura: {
        numero: factura.numero,
        tipo: factura.tipo,
        numeroRectificada: factura.numeroRectificada,
        motivoRectificacion: factura.motivoRectificacion,
        fechaEmision: factura.fechaEmision,
        fechaSesion: factura.fechaSesion,
        descripcion,
        importe: factura.importe,
        // Por ahora todas las sesiones van exentas por artículo 20
        exencion: 'E1',
        qrUrl: factura.qrUrl,
      },
      emisor,
      destinatario: { nombre: factura.pacienteNombre, dni: factura.pacienteDni },
    },
    error: null,
  }
}
