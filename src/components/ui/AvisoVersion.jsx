import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

/* ================================================================
   AVISO DE VERSIÓN NUEVA

   Psicofactur es una PWA: el service worker cachea la app entera para
   que abra al instante y funcione sin cobertura. El precio es que, tras
   un despliegue, el navegador sigue con la versión vieja hasta que se
   recarga — y la PWA instalada casi nunca se cierra.

   Cuando el service worker detecta una versión nueva (al abrir y cada
   media hora), esto enseña un aviso con botón. «Actualizar» activa el
   worker nuevo y recarga; la equis lo aparca hasta la próxima.
   ================================================================ */
export default function AvisoVersion() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return
      setInterval(() => registro.update(), 30 * 60 * 1000)
    },
  })

  if (!hayVersionNueva) return null

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
        onClick={() => setHayVersionNueva(false)}
        aria-label="Ahora no"
        className="shrink-0 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
