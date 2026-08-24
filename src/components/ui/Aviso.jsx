import { useEffect } from 'react'
import { CheckCircle2, TriangleAlert, X } from 'lucide-react'

/* Confirmación flotante abajo del todo: "se ha hecho esto".
   Se va sola a los 6 segundos y respeta la barra inferior del móvil. */
export default function Aviso({ aviso, alCerrar }) {
  useEffect(() => {
    if (!aviso) return
    const id = setTimeout(alCerrar, 6000)
    return () => clearTimeout(id)
  }, [aviso, alCerrar])

  if (!aviso) return null
  const esError = aviso.tipo === 'error'

  return (
    <div
      role="status"
      aria-live="polite"
      className="subir fixed inset-x-0 bottom-20 z-40 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center gap-3 rounded-2xl border border-borde bg-white px-4 py-3 shadow-elevada md:bottom-6 md:left-64"
    >
      {esError ? (
        <TriangleAlert className="size-5 shrink-0 text-rojo" strokeWidth={2} />
      ) : (
        <CheckCircle2 className="size-5 shrink-0 text-verde" strokeWidth={2} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tinta">{aviso.titulo}</p>
        {aviso.detalle && (
          <p className="truncate text-sm text-tinta-suave">{aviso.detalle}</p>
        )}
      </div>
      {aviso.accion}
      <button
        onClick={alCerrar}
        aria-label="Cerrar aviso"
        className="rounded-full p-1.5 text-tinta-tenue transition-colors hover:bg-crema hover:text-tinta"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
