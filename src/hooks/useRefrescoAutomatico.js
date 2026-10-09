import { useEffect, useRef } from 'react'

/**
 * Vuelve a pedir los datos de una pantalla que lleva rato abierta.
 *
 * Una PWA se queda abierta días en segundo plano; el móvil corta las
 * conexiones en vivo y el portátil se duerme. Cuando eso pasa, la
 * pantalla sigue enseñando lo de la última vez que cargó. Esto la
 * refresca:
 *   · al volver a la app o a la pestaña,
 *   · al recuperar internet,
 *   · y cada pocos minutos mientras se está mirando.
 *
 * `alRefrescar` debe recargar SIN pintar «Cargando…» (es una recarga
 * silenciosa: la pantalla no debe parpadear).
 *
 * @param {() => void} alRefrescar
 * @param {{cadaMs?: number, minimoMs?: number}} opciones
 *        minimoMs = separación mínima entre dos refrescos, porque al volver
 *        a la app saltan varios eventos casi a la vez (focus, visibilidad…).
 */
export function useRefrescoAutomatico(
  alRefrescar,
  { cadaMs = 3 * 60 * 1000, minimoMs = 10 * 1000 } = {},
) {
  const ultima = useRef(alRefrescar)
  ultima.current = alRefrescar

  useEffect(() => {
    let anterior = Date.now()

    const lanzar = () => {
      if (document.visibilityState !== 'visible') return
      const ahora = Date.now()
      if (ahora - anterior < minimoMs) return
      anterior = ahora
      ultima.current()
    }

    const intervalo = setInterval(lanzar, cadaMs)
    document.addEventListener('visibilitychange', lanzar)
    window.addEventListener('focus', lanzar)
    window.addEventListener('online', lanzar)
    window.addEventListener('pageshow', lanzar)

    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', lanzar)
      window.removeEventListener('focus', lanzar)
      window.removeEventListener('online', lanzar)
      window.removeEventListener('pageshow', lanzar)
    }
  }, [cadaMs, minimoMs])
}
