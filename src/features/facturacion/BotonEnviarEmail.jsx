import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Mail, MailCheck, MailX } from 'lucide-react'
import { prepararFacturaPDF } from './datosPdfFactura'
import { enviarFacturaPorEmail } from '../../services/correo'
import { fechaNumerica } from '../../lib/fechas'

/* ================================================================
   Botón «Enviar al paciente»: le manda su factura por correo.

   Aparece con la misma condición que «Descargar»: sólo cuando Hacienda
   ha ACEPTADO la factura. El motivo es el mismo y no es un detalle —el
   QR de una factura sin aceptar apunta a un registro que no existe o
   que fue rechazado—, pero aquí pesa más: un PDF que ella se descarga
   puede tirarlo si ve que está mal; un correo que ya ha salido, no.

   El PDF se dibuja aquí, en el navegador, exactamente igual que el que
   se descarga (los dos pasan por `prepararFacturaPDF`), y viaja en
   base64 a la Edge Function. La dirección de destino NO se manda: la
   lee ella de la ficha del paciente.
   ================================================================ */
export default function BotonEnviarEmail({ factura, verifactuActivo = false, alCambiar, alFallar }) {
  const [trabajando, setTrabajando] = useState(false)
  const navegar = useNavigate()

  /* Misma condición que «Descargar»: con Veri*Factu, factura aceptada
     por Hacienda; sin Veri*Factu, factura emitida. */
  const entregable = verifactuActivo
    ? factura.verifactuEstado === 'Correcto'
    : factura.emitida
  if (!entregable) return null

  const yaEnviada = Boolean(factura.emailEnviadoEn)
  const sinCorreo = !factura.pacienteCorreo

  /* Sin correo en la ficha no hay nada que enviar. En vez de un botón
     apagado que no explica nada, se ofrece el atajo a arreglarlo. */
  if (sinCorreo) {
    return (
      <button
        type="button"
        onClick={() => navegar(`/pacientes/${factura.pacienteId}`)}
        title={`${factura.pacienteNombre} no tiene correo en su ficha. Pulsa para añadírselo.`}
        aria-label="El paciente no tiene correo en su ficha"
        className="rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-ambar-suave hover:text-ambar"
      >
        <MailX className="size-4" strokeWidth={2} />
      </button>
    )
  }

  const enviar = async () => {
    if (trabajando) return

    if (yaEnviada) {
      const cuando = fechaNumerica(String(factura.emailEnviadoEn).slice(0, 10))
      const confirmado = window.confirm(
        `Esta factura ya se le mandó el ${cuando} a ${factura.emailDestinatario}.\n\n¿Quieres volver a enviársela?`,
      )
      if (!confirmado) return
    }

    setTrabajando(true)

    const { data: datosPdf, error: errorPdf } = await prepararFacturaPDF(factura)
    if (errorPdf) {
      setTrabajando(false)
      alFallar?.({ tipo: 'error', titulo: errorPdf.mensaje })
      return
    }

    let pdfBase64
    let nombreFichero
    try {
      const { construirFacturaPDF, nombreFicheroFactura } = await import('./pdfFactura')
      const doc = await construirFacturaPDF(datosPdf)

      /* `datauristring` devuelve «data:application/pdf;…;base64,XXXX».
         Al otro lado sólo interesa lo de después de la coma. */
      const uri = doc.output('datauristring')
      pdfBase64 = uri.slice(uri.indexOf(',') + 1)
      nombreFichero = nombreFicheroFactura(datosPdf.factura)
    } catch (e) {
      setTrabajando(false)
      console.error('[Psicofactur] no se pudo generar el PDF para enviarlo:', e)
      alFallar?.({ tipo: 'error', titulo: 'No se ha podido generar el PDF de la factura.' })
      return
    }

    const { data, error } = await enviarFacturaPorEmail({
      facturaId: factura.id,
      pdfBase64,
      nombreFichero,
    })
    setTrabajando(false)

    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      // No tiene correo, o el que tiene está mal: se la lleva a la ficha
      if (error.sinEmail) navegar(`/pacientes/${factura.pacienteId}`)
      return
    }

    alFallar?.({
      tipo: 'exito',
      titulo: `Factura ${factura.numero} enviada a ${factura.pacienteNombre}`,
      detalle: data.destinatario,
    })

    // La fila se entera al momento, sin volver a consultar
    alCambiar?.({
      ...factura,
      emailEnviadoEn: data.enviadaEn,
      emailDestinatario: data.destinatario,
    })
  }

  return (
    <button
      type="button"
      onClick={enviar}
      disabled={trabajando}
      title={
        yaEnviada
          ? `Enviada el ${fechaNumerica(String(factura.emailEnviadoEn).slice(0, 10))} a ${factura.emailDestinatario}. Pulsa para volver a enviarla.`
          : `Enviar la factura por correo a ${factura.pacienteCorreo}`
      }
      aria-label={yaEnviada ? 'Volver a enviar la factura por correo' : 'Enviar la factura por correo'}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
        yaEnviada
          ? 'text-verde hover:bg-verde-suave'
          : 'text-tinta-tenue hover:bg-marca-50 hover:text-marca-700'
      }`}
    >
      {trabajando ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
      ) : yaEnviada ? (
        <MailCheck className="size-4" strokeWidth={2} />
      ) : (
        <Mail className="size-4" strokeWidth={2} />
      )}
    </button>
  )
}
