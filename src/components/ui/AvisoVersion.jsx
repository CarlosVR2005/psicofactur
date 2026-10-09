import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

/* ================================================================
   AVISO DE VERSIÓN NUEVA

   Psicofactur es una PWA: el service worker cachea la app entera para
   que abra al instante y funcione sin cobertura. El precio es que, tras
   un despliegue, el navegador sigue con la versión vieja hasta que se
   recarga — y la PWA instalada casi nunca se cierra.

   Cuando el service worker detecta una versión nueva (al abrir, al volver
   a la app y cada media hora), la aplica SOLA en un momento en que no
   estorba: nada más abrir la app, o al irse a segundo plano. Nunca con
   una ventana abierta ni mientras se escribe en un campo.
   Si no es buen momento, enseña un aviso con botón: «Actualizar» activa
   el worker nuevo y recarga; la equis lo aparca hasta que se vuelva a la
   app (no para siempre, como antes: así nadie se queda con una versión
   vieja días sin enterarse).
   ================================================================ */
const VENTANA_RECIEN_ABIERTA_MS = 20 * 1000

/** ¿Se puede recargar sin que se pierda algo a medio escribir? */
function esMomentoSeguro() {
  if (document.querySelector('[role="dialog"]')) return false
  const activo = document.activeElement?.tagName
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(activo)
}

export default function AvisoVersion() {
  const [aparcado, setAparcado] = useState(false)

  const {
    needRefresh: [hayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return
      const buscar = () => {
        if (navigator.onLine) registro.update().catch(() => {})
      }
      setInterval(buscar, 30 * 60 * 1000)
      // La PWA instalada casi nunca se cierra: al volver a ella, a mirar
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') buscar()
      })
    },
  })

  useEffect(() => {
    if (!hayVersionNueva) return

    const aplicar = () => {
      if (esMomentoSeguro()) updateServiceWorker(true)
    }

    // Recién abierta (o ya en segundo plano) no hay nada que perder
    if (
      document.visibilityState === 'hidden' ||
      performance.now() < VENTANA_RECIEN_ABIERTA_MS
    ) {
      aplicar()
    }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') aplicar()
      else setAparcado(false)
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [hayVersionNueva, updateServiceWorker])

  if (!hayVersionNueva || aparcado) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="subir fixed inset-x-0 bottom-20 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center gap-3 rounded-2xl bg-marca-600 px-4 py-3 text-white shadow-elevada md:bottom-6 md:left-64"
    >
      <RefreshCw className="size-5 shrink-0" strokeWidth={2} />
      <p className="min-w-0 flex-1 text-sm font-medium">
        Hay una versión nueva de Psicofactur.
      </p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/25 active:scale-[0.98]"
      >
        Actualizar
      </button>
      <button
        onClick={() => setAparcado(true)}
        aria-label="Ahora no"
        className="shrink-0 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
