import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, PenLine } from 'lucide-react'

/* ================================================================
   LIENZO DE FIRMA

   Un <canvas> y nada más. Se descartó `signature_pad` a propósito: son
   200 líneas de eventos de puntero para una app que hoy pesa cuatro
   dependencias, y la que se usaría aquí no aporta nada que no esté en
   `PointerEvent`.

   Dos cosas que no son evidentes y sin las que esto no funciona en el
   móvil:

   · `touch-action: none`. Sin eso, arrastrar el dedo por el recuadro
     hace scroll de la página en vez de pintar, y no hay forma de
     firmar en un iPhone.

   · Los trazos se guardan como PUNTOS, no sólo pintados en el lienzo.
     Al girar el móvil o al abrir el teclado, el canvas cambia de
     tamaño y hay que redibujarlo entero: si sólo estuvieran los
     píxeles, la firma se borraría sola al girar la pantalla.

   El lienzo se pinta a la resolución real de la pantalla
   (`devicePixelRatio`, con tope 2) para que el trazo no salga borroso,
   pero las coordenadas se guardan en píxeles CSS.
   ================================================================ */

const COLOR_TRAZO = '#2e2b28'
const GROSOR = 2.4

export default function LienzoFirma({ alCambiar, deshabilitado = false }) {
  const contenedor = useRef(null)
  const lienzo = useRef(null)
  const trazos = useRef([]) // [[{x, y}, …], …] en píxeles CSS
  const trazoActual = useRef(null)
  const [hayTrazo, setHayTrazo] = useState(false)

  /** Repinta el lienzo entero a partir de los puntos guardados. */
  const repintar = useCallback(() => {
    const canvas = lienzo.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const { width } = canvas.getBoundingClientRect()

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    /* Fondo blanco explícito: el PNG que se guarda tiene que verse
       igual en un visor con fondo oscuro que aquí. */
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const escala = canvas.width / (width || 1)
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.strokeStyle = COLOR_TRAZO
    ctx.lineWidth = GROSOR
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const puntos of trazos.current) {
      if (puntos.length === 1) {
        // Un toque suelto: un punto, que si no no se vería nada
        const [p] = puntos
        ctx.beginPath()
        ctx.arc(p.x, p.y, GROSOR / 2, 0, Math.PI * 2)
        ctx.fillStyle = COLOR_TRAZO
        ctx.fill()
        continue
      }
      ctx.beginPath()
      ctx.moveTo(puntos[0].x, puntos[0].y)
      for (let i = 1; i < puntos.length; i += 1) ctx.lineTo(puntos[i].x, puntos[i].y)
      ctx.stroke()
    }
  }, [])

  /** Ajusta la resolución del lienzo a su tamaño real en pantalla. */
  const ajustarTamano = useCallback(() => {
    const canvas = lienzo.current
    const caja = contenedor.current
    if (!canvas || !caja) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const { width, height } = caja.getBoundingClientRect()
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    repintar()
  }, [repintar])

  useEffect(() => {
    ajustarTamano()
    const observador = new ResizeObserver(ajustarTamano)
    if (contenedor.current) observador.observe(contenedor.current)
    return () => observador.disconnect()
  }, [ajustarTamano])

  const punto = (e) => {
    const { left, top } = lienzo.current.getBoundingClientRect()
    return { x: e.clientX - left, y: e.clientY - top }
  }

  const avisarDelCambio = () => {
    const vacio = trazos.current.length === 0
    setHayTrazo(!vacio)
    alCambiar?.(vacio ? null : lienzo.current.toDataURL('image/png'))
  }

  const empezar = (e) => {
    if (deshabilitado) return
    e.preventDefault()

    /* Capturar el puntero mantiene el trazo aunque el dedo se salga del
       recuadro. Si el navegador no deja (el puntero ya no está activo),
       se dibuja igual: es una mejora, no un requisito. */
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch (_) {
      // se sigue dibujando sin captura
    }

    trazoActual.current = [punto(e)]
    trazos.current.push(trazoActual.current)
    repintar()
  }

  const seguir = (e) => {
    if (!trazoActual.current) return
    e.preventDefault()
    trazoActual.current.push(punto(e))
    repintar()
  }

  const terminar = (e) => {
    if (!trazoActual.current) return
    e.preventDefault()
    trazoActual.current = null
    avisarDelCambio()
  }

  const limpiar = () => {
    trazos.current = []
    trazoActual.current = null
    repintar()
    avisarDelCambio()
  }

  return (
    <div>
      <div
        ref={contenedor}
        className="relative h-44 w-full overflow-hidden rounded-2xl border-2 border-dashed border-borde-fuerte bg-white sm:h-52"
      >
        <canvas
          ref={lienzo}
          onPointerDown={empezar}
          onPointerMove={seguir}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onPointerLeave={terminar}
          className="size-full cursor-crosshair"
          style={{ touchAction: 'none' }}
          aria-label="Recuadro para firmar con el dedo o el ratón"
          role="img"
        />

        {/* La pista de dónde firmar. No se dibuja en el lienzo: si
            estuviera dentro, saldría en el PNG que se guarda. */}
        {!hayTrazo && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-tinta-tenue">
            <PenLine className="size-6" strokeWidth={1.8} />
            <p className="text-sm">Firma aquí con el dedo</p>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-8 bottom-8 border-b border-borde" />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-tinta-tenue">
          {hayTrazo ? 'Si no te convence, bórrala y vuelve a firmar.' : 'Usa el dedo en el móvil o el ratón en el ordenador.'}
        </p>
        <button
          type="button"
          onClick={limpiar}
          disabled={!hayTrazo || deshabilitado}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-crema hover:text-tinta disabled:opacity-40"
        >
          <Eraser className="size-4" strokeWidth={2} />
          Limpiar trazo
        </button>
      </div>
    </div>
  )
}
