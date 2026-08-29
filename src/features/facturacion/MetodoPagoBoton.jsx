import { useState } from 'react'
import { Banknote, Coins, CreditCard, Wallet } from 'lucide-react'
import { cambiarMetodoPago } from '../../services/facturas'

/* Forma de cobro de una factura, en un solo botón-icono para que ocupe
   poco y se lea de un vistazo. Un toque va pasando por:

     sin especificar (cartera) → efectivo (billete) → tarjeta → …

   Mismo gesto que el badge de estado de pago, que también se cambia
   pulsándolo. Es un dato de contabilidad y no viaja a Hacienda (el
   registro de facturación no recoge la forma de pago), así que se puede
   cambiar cuando sea. */

const CICLO = ['', 'efectivo', 'tarjeta']

const PINTA = {
  '': {
    Icono: Wallet,
    clase: 'text-tinta-tenue hover:bg-crema hover:text-tinta',
    nombre: 'sin especificar',
  },
  efectivo: {
    Icono: Banknote,
    clase: 'text-verde hover:bg-verde-suave',
    nombre: 'en efectivo',
  },
  tarjeta: {
    Icono: CreditCard,
    clase: 'text-azul hover:bg-azul-suave',
    nombre: 'con tarjeta',
  },
}

/* Valores heredados (transferencia, bizum, otro): se ven con su nombre,
   y el ciclo los deja en «sin especificar» al primer toque. */
const OTRO = { Icono: Coins, clase: 'text-tinta-suave hover:bg-crema hover:text-tinta' }

export default function MetodoPagoBoton({ factura, alCambiar, alFallar, disabled = false }) {
  const [trabajando, setTrabajando] = useState(false)

  const actual = factura.metodoPago ?? ''
  const pinta = PINTA[actual] ?? { ...OTRO, nombre: actual }
  const { Icono } = pinta
  const etiqueta = `Forma de cobro: ${pinta.nombre}. Pulsa para cambiar.`

  const cambiar = async () => {
    if (trabajando) return
    // Si el valor actual no está en el ciclo (heredado), indexOf da -1 y
    // el siguiente sale '' (sin especificar).
    const siguiente = CICLO[(CICLO.indexOf(actual) + 1) % CICLO.length]
    setTrabajando(true)
    const { data, error } = await cambiarMetodoPago(factura.id, siguiente)
    setTrabajando(false)
    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }
    alCambiar?.(data)
  }

  return (
    <button
      type="button"
      onClick={cambiar}
      disabled={disabled || trabajando}
      title={etiqueta}
      aria-label={etiqueta}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${pinta.clase}`}
    >
      <Icono className="size-4" strokeWidth={2} />
    </button>
  )
}
