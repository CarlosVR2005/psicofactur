import { useState } from 'react'
import { FileCheck2, Loader2 } from 'lucide-react'
import { getDatosFiscales } from '../../services/verifacti'
import { TIPOS_CITA } from '../../lib/tipos'
import { aClave } from '../../lib/fechas'

/* Botón «Justificante de asistencia» de una sesión facturada.

   Sale en cualquier fila que venga de una cita —emitida o en borrador,
   cobrada o no—, porque la asistencia no depende de la factura. No sale
   en las facturas manuales (no tienen sesión) ni en las descartadas o
   anuladas (o no hubo sesión, o ya la justifica su rectificativa).

   Como el PDF de la factura, la librería se carga sólo al pulsar. */
export default function BotonJustificante({ factura, alFallar }) {
  const [trabajando, setTrabajando] = useState(false)

  const anulada = factura.estado === 'cancelado' || factura.estado === 'anulada'
  if (!factura.fechaSesion || factura.esManual || anulada) return null

  const descargar = async () => {
    if (trabajando) return
    setTrabajando(true)

    const { data: emisor, error } = await getDatosFiscales()
    const nombre = (emisor?.razonSocial || emisor?.nombre || '').trim()
    if (error || !nombre) {
      setTrabajando(false)
      alFallar?.({
        tipo: 'error',
        titulo: error?.mensaje ?? 'Para el justificante falta tu nombre en Ajustes.',
      })
      return
    }

    try {
      const { descargarJustificantePDF } = await import('./pdfJustificante')
      await descargarJustificantePDF({
        sesion: {
          fecha: factura.fechaSesion,
          hora: factura.horaSesion,
          duracion: factura.duracionSesion ?? TIPOS_CITA[factura.tipoSesion]?.duracion,
          tipo: TIPOS_CITA[factura.tipoSesion]?.descripcionFactura ?? 'Sesión de psicoterapia',
        },
        paciente: { nombre: factura.pacienteNombre, dni: factura.pacienteDni },
        psicologa: { ...emisor, nombre },
        fechaExpedicion: aClave(new Date()),
      })
    } catch (e) {
      console.error('[Psicofactur] no se pudo generar el justificante:', e)
      alFallar?.({ tipo: 'error', titulo: 'No se ha podido generar el justificante.' })
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={trabajando}
      title="Descargar el justificante de asistencia de esta sesión"
      aria-label="Descargar el justificante de asistencia"
      className="rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-marca-50 hover:text-marca-700 disabled:opacity-50"
    >
      {trabajando ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
      ) : (
        <FileCheck2 className="size-4" strokeWidth={2} />
      )}
    </button>
  )
}
