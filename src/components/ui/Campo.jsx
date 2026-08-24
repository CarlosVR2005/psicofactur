/* Campos de formulario: etiqueta siempre visible (nada de placeholders
   como única pista) y zonas de toque generosas. */

const BASE =
  'w-full rounded-xl border border-borde-fuerte bg-white px-3.5 py-2.5 text-tinta placeholder:text-tinta-tenue transition-colors focus:border-marca-400 focus:outline-none focus:ring-2 focus:ring-marca-200'

export function Campo({ etiqueta, ayuda, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-tinta-suave">
        {etiqueta}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-tinta-tenue">{ayuda}</span>}
    </label>
  )
}

export function Entrada({ className = '', ...props }) {
  return <input className={`${BASE} ${className}`} {...props} />
}

export function AreaTexto({ className = '', ...props }) {
  return <textarea rows={4} className={`${BASE} resize-y ${className}`} {...props} />
}

export function Seleccion({ className = '', children, ...props }) {
  return (
    <select className={`${BASE} appearance-none pr-9 ${className}`} {...props}>
      {children}
    </select>
  )
}
