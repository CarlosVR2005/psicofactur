import { useState } from 'react'
import { Check, Loader2, ReceiptEuro } from 'lucide-react'
import { facturarSesion } from '../../services/facturas'
import { euros } from '../../lib/formato'
import { etiquetaDia } from '../../lib/fechas'

/* Botón «Facturar» que acompaña a cada paciente.
   Un toque emite la factura de su sesión más antigua sin facturar
   (importe = precio por sesión del paciente) y avisa de lo que ha hecho.
   El número de factura lo pone la base de datos, no esta pantalla. */
export default function BotonFacturar({
  sesiones = [],
  alFacturar,
  tamano = 'sm',
  className = '',
}) {
  const [trabajando, setTrabajando] = useState(false)
  const pendientes = sesiones.length
  const siguiente = sesiones[0] // la más antigua

  const facturar = async (e) => {
    // El botón vive dentro de la tarjeta-enlace del paciente
    e.preventDefault()
    e.stopPropagation()
    if (!siguiente || trabajando) return

    setTrabajando(true)
    const { data, error } = await facturarSesion(siguiente)
    setTrabajando(false)

    if (error) {
      alFacturar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }

    alFacturar?.({
      tipo: 'exito',
      titulo: `Factura ${data.numero} creada · ${euros(data.importe)}`,
      detalle: `${data.pacienteNombre} · sesión de ${etiquetaDia(siguiente.fecha).toLowerCase()}`,
      factura: data,
      sesion: siguiente,
    })
  }

  const alto = tamano === 'md' ? 'px-4 py-2.5 text-base' : 'px-3 py-1.5 text-sm'

  if (pendientes === 0) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-borde bg-crema/60 font-medium text-tinta-tenue ${alto} ${className}`}
        title="No hay sesiones pendientes de facturar"
      >
        <Check className="size-4" strokeWidth={2} />
        Al día
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={facturar}
      disabled={trabajando}
      title={`Facturar la sesión de ${etiquetaDia(siguiente.fecha).toLowerCase()} · ${euros(siguiente.precioSesion)}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-marca-50 font-medium text-marca-700 transition-colors hover:bg-marca-100 active:scale-[0.98] disabled:opacity-50 ${alto} ${className}`}
    >
      {trabajando ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
      ) : (
        <ReceiptEuro className="size-4" strokeWidth={2} />
      )}
      Facturar
      {pendientes > 1 && (
        <span className="rounded-full bg-white px-1.5 text-xs tabular-nums">
          {pendientes}
        </span>
      )}
    </button>
  )
}
