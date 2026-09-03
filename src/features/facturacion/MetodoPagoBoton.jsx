import { useState } from 'react'
import { Banknote, Coins, CreditCard, Wallet } from 'lucide-react'
import { cambiarMetodoPago } from '../../services/facturas'

/* Forma de cobro de una factura, en un chip con icono y texto para que se
   lea de un vistazo. Un toque va pasando por:

     sin especificar → efectivo → tarjeta → …

   Mismo gesto que el badge de estado de pago, que también se cambia
   pulsándolo. Es un dato de contabilidad y no viaja a Hacienda (el
   registro de facturación no recoge la forma de pago), así que se puede
   cambiar cuando sea. */

const CICLO = ['', 'efectivo', 'tarjeta']

// Mismo lenguaje visual que el Badge de estado: chip redondo con borde.
const BASE =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50'

const PINTA = {
  '': {
    Icono: Wallet,
    etiqueta: 'Sin cobro',
    nombre: 'sin especificar',
    clase:
      'border-borde border-dashed bg-crema text-tinta-suave hover:border-marca-200 hover:bg-marca-50 hover:text-marca-700',
  },
  efectivo: {
    Icono: Banknote,
    etiqueta: 'Efectivo',
    nombre: 'en efectivo',
    clase: 'border-verde/25 bg-verde-suave text-verde hover:bg-verde/15',
  },
  tarjeta: {
    Icono: CreditCard,
    etiqueta: 'Tarjeta',
    nombre: 'con tarjeta',
    clase: 'border-azul/25 bg-azul-suave text-azul hover:bg-azul/15',
  },
}

/* Valores heredados (transferencia, bizum, otro): se ven con su nombre,
   y el ciclo los deja en «sin especificar» al primer toque. */
const OTRO = {
  Icono: Coins,
  clase: 'border-borde bg-crema text-tinta-suave hover:bg-marca-50 hover:text-marca-700',
}

const capitalizar = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export default function MetodoPagoBoton({ factura, alCambiar, alFallar, disabled = false }) {
  const [trabajando, setTrabajando] = useState(false)

  const actual = factura.metodoPago ?? ''
  const pinta = PINTA[actual] ?? { ...OTRO, etiqueta: capitalizar(actual), nombre: actual }
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
      className={`${BASE} ${pinta.clase}`}
    >
      <Icono className="size-3.5" strokeWidth={2.2} />
      {pinta.etiqueta}
    </button>
  )
}
