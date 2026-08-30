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
     `descripcion`, que se compone igual en la Edge Function: el concepto
     propio si la factura es manual, o el tipo de sesión si sale de una
     cita. */
  const etiqueta =
    TIPOS_CITA[factura.tipoSesion]?.descripcionFactura ?? 'Sesión de psicoterapia'
  const descripcion =
    factura.concepto?.trim() ||
    (factura.fechaSesion
      ? `${etiqueta} del ${factura.fechaSesion.split('-').reverse().join('/')}`
      : etiqueta)

  // Con IGIC la operación está sujeta y no exenta; si no, exenta por
  // asistencia sanitaria.
  const exencion = factura.tipoIgic > 0 ? null : 'E1'

  /* Destinatario: para una factura a empresa, la empresa (CIF); para un
     particular, la persona (DNI). Si la factura ya se emitió se usa la
     copia que se guardó ese día, no la ficha de ahora. */
  const destinatario = factura.esEmpresa
    ? {
        nombre: factura.destinatarioNombre || factura.empresaRazonSocial,
        dni: factura.destinatarioNif || factura.empresaCif,
        domicilio: factura.destinatarioDomicilio || factura.empresaDomicilio,
      }
    : {
        nombre: factura.pacienteNombre,
        dni: factura.pacienteDni,
      }

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
        // Desglose: `total` (base + IGIC) es el TOTAL de la factura;
        // `liquido` (total − IRPF) es lo que se cobra de verdad.
        base: factura.base,
        tipoIgic: factura.tipoIgic || 0,
        cuotaIgic: factura.cuotaIgic || 0,
        tipoIrpf: factura.tipoIrpf || 0,
        cuotaIrpf: factura.cuotaIrpf || 0,
        total: factura.total,
        liquido: factura.liquido ?? factura.importe,
        exencion,
        regimenCanarias: emisor.regimenCanarias === true,
        qrUrl: factura.qrUrl,
      },
      emisor,
      destinatario,
    },
    error: null,
  }
}
