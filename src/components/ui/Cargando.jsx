import { Loader2 } from 'lucide-react'

/** Spinner con texto. Para esperas cortas dentro de una pantalla. */
export default function Cargando({ texto = 'Cargando…', className = '' }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 py-14 text-tinta-suave ${className}`}
    >
      <Loader2 className="size-6 animate-spin text-marca-500" strokeWidth={2.2} />
      <p className="text-sm">{texto}</p>
    </div>
  )
}

/** Placeholders con la forma de las tarjetas: la pantalla no "salta" al cargar. */
export function EsqueletoLista({ filas = 5 }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl border border-borde bg-white px-4 py-3.5"
        >
          <div className="size-10 animate-pulse rounded-full bg-borde/70" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-borde/70" />
            <div className="h-3 w-3/5 animate-pulse rounded-full bg-borde/50" />
          </div>
        </div>
      ))}
    </div>
  )
}
