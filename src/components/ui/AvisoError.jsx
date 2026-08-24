import { RotateCw, TriangleAlert } from 'lucide-react'
import Boton from './Boton'

/* Aviso de error pensado para alguien que no es informático:
   qué ha pasado, en una frase, y un botón para volver a intentarlo. */
export default function AvisoError({ error, alReintentar, className = '' }) {
  if (!error) return null
  const mensaje = typeof error === 'string' ? error : error.mensaje

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-rojo/25 bg-rojo-suave px-4 py-3.5 ${className}`}
    >
      <TriangleAlert className="size-5 shrink-0 text-rojo" strokeWidth={2} />
      <p className="min-w-0 flex-1 text-sm text-tinta">{mensaje}</p>
      {alReintentar && (
        <Boton variante="secundario" tamano="sm" icono={RotateCw} onClick={alReintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  )
}
