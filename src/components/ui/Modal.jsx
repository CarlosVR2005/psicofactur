import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/* En escritorio: ventana centrada.
   En móvil: hoja que sube desde abajo (patrón nativo de iPhone). */
export default function Modal({ abierto, alCerrar, titulo, descripcion, pie, children }) {
  useEffect(() => {
    if (!abierto) return
    const alPulsarTecla = (e) => e.key === 'Escape' && alCerrar()
    document.addEventListener('keydown', alPulsarTecla)
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alPulsarTecla)
      document.body.style.overflow = overflowPrevio
    }
  }, [abierto, alCerrar])

  if (!abierto) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="aparecer absolute inset-0 bg-tinta/25 backdrop-blur-[2px]"
        onClick={alCerrar}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="subir relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-elevada sm:max-w-lg sm:rounded-3xl"
      >
        <header className="flex items-start gap-4 border-b border-borde px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
            {descripcion && (
              <p className="mt-0.5 text-sm text-tinta-suave">{descripcion}</p>
            )}
          </div>
          <button
            onClick={alCerrar}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-full p-2 text-tinta-tenue transition-colors hover:bg-crema hover:text-tinta"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {pie && (
          <footer className="flex flex-col-reverse gap-2 border-t border-borde bg-crema/60 px-5 py-4 pb-segura sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
            {pie}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
