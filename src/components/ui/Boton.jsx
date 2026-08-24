const VARIANTES = {
  principal:
    'bg-marca-500 text-white hover:bg-marca-600 active:bg-marca-700 shadow-suave',
  secundario:
    'bg-white text-tinta border border-borde-fuerte hover:bg-crema active:bg-borde/50',
  suave: 'bg-marca-50 text-marca-700 hover:bg-marca-100',
  fantasma: 'text-tinta-suave hover:bg-borde/40 hover:text-tinta',
  peligro: 'bg-white text-rojo border border-rojo/30 hover:bg-rojo-suave',
}

const TAMANOS = {
  sm: 'text-sm px-3 py-1.5 gap-1.5 rounded-lg',
  md: 'px-4 py-2.5 gap-2 rounded-xl', // 44px de alto: cómodo con el dedo
  lg: 'text-lg px-5 py-3 gap-2.5 rounded-xl',
}

export default function Boton({
  variante = 'principal',
  tamano = 'md',
  icono: Icono,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      {...props}
    >
      {Icono && <Icono className={tamano === 'sm' ? 'size-4' : 'size-5'} strokeWidth={2} />}
      {children}
    </button>
  )
}
