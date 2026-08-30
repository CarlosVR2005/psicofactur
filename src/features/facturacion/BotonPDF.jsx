import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { prepararFacturaPDF } from './datosPdfFactura'

/* ================================================================
   Botón «Descargar factura»: el PDF que se le entrega al paciente.

   Sólo aparece cuando Hacienda ha ACEPTADO la factura, y eso es
   deliberado:

     · sin emitir  → no hay QR, y una factura de un sistema Veri*Factu
                     tiene que llevarlo. El papel estaría incompleto.
     · «Pendiente» → el QR existe pero la AEAT aún no ha resuelto. Si
                     luego la rechaza, el paciente se queda con una
                     factura cuyo QR no valida. Se espera el minuto.
     · «Incorrecto»→ el QR apunta a un registro rechazado. Entregarla
                     sería darle a la paciente un papel que no vale.

   El PDF se genera aquí, en el navegador, y no se guarda en ningún
   sitio: así no hay facturas de una consulta de psicología colgando de
   ninguna URL.

   La librería que lo dibuja se carga SÓLO al pulsar (`import()` de
   abajo). Pesa unos 140 KB comprimidos —más que toda la aplicación
   junta— y sería absurdo que se descargara al abrir la agenda alguien
   que quizá no imprima una factura en toda la mañana.
   ================================================================ */
export default function BotonPDF({ factura, verifactuActivo = false, alFallar }) {
  const [trabajando, setTrabajando] = useState(false)

  /* Con Veri*Factu, sólo cuando Hacienda la ha aceptado (hace falta el
     QR). Sin Veri*Factu, en cuanto está emitida: es una factura
     ordinaria completa, sin QR. */
  const entregable = verifactuActivo
    ? factura.verifactuEstado === 'Correcto'
    : factura.emitida
  if (!entregable) return null

  const descargar = async () => {
    if (trabajando) return
    setTrabajando(true)

    const { data, error } = await prepararFacturaPDF(factura)

    if (error) {
      setTrabajando(false)
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }

    try {
      // Se carga aquí, no arriba: ver la nota de la cabecera
      const { descargarFacturaPDF } = await import('./pdfFactura')
      await descargarFacturaPDF(data)
    } catch (e) {
      console.error('[Psicofactur] no se pudo generar el PDF:', e)
      alFallar?.({ tipo: 'error', titulo: 'No se ha podido generar el PDF de la factura.' })
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={trabajando}
      title="Descargar la factura en PDF para el paciente"
      aria-label="Descargar la factura en PDF"
      className="rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-marca-50 hover:text-marca-700 disabled:opacity-50"
    >
      {trabajando ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
      ) : (
        <Download className="size-4" strokeWidth={2} />
      )}
    </button>
  )
}
