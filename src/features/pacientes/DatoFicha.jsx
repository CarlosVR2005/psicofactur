/* Una fila de la ficha: etiqueta pequeña arriba, dato grande y legible
   debajo. Si se pasa `href`, el dato se puede pulsar (llamar, escribir…). */
export default function DatoFicha({ icono: Icono, etiqueta, valor, href, ayuda }) {
  const contenido = (
    <>
      <span className="block text-xs font-medium uppercase tracking-wide text-tinta-tenue">
        {etiqueta}
      </span>
      <span
        className={`mt-0.5 block wrap-anywhere font-medium ${
          href ? 'text-marca-600 underline-offset-2 group-hover:underline' : 'text-tinta'
        }`}
      >
        {valor || <span className="text-tinta-tenue">—</span>}
      </span>
      {ayuda && <span className="mt-0.5 block text-sm text-tinta-suave">{ayuda}</span>}
    </>
  )

  return (
    <div className="flex min-w-0 items-start gap-3">
      {Icono && (
        <span
          className={`mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl ${
            href ? 'bg-crema text-tinta-suave' : 'text-tinta-tenue'
          }`}
        >
          <Icono className="size-4.5" strokeWidth={1.9} />
        </span>
      )}
      <div className="min-w-0">
        {href ? (
          <a href={href} className="group block">
            {contenido}
          </a>
        ) : (
          contenido
        )}
      </div>
    </div>
  )
}
