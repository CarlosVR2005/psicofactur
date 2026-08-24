import { iniciales } from '../../lib/formato'

/* Color estable por paciente: el mismo nombre da siempre el mismo tono,
   así se reconocen de un vistazo sin necesidad de fotos. */
const COLORES = [
  'bg-marca-100 text-marca-700',
  'bg-malva-suave text-malva',
  'bg-azul-suave text-azul',
  'bg-ambar-suave text-ambar',
  'bg-verde-suave text-verde',
]

const TAMANOS = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
}

export default function Avatar({ nombre = '', tamano = 'md', className = '' }) {
  const indice =
    [...nombre].reduce((suma, letra) => suma + letra.charCodeAt(0), 0) % COLORES.length

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${COLORES[indice]} ${TAMANOS[tamano]} ${className}`}
    >
      {iniciales(nombre)}
    </span>
  )
}
