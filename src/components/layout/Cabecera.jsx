/* Cabecera de página: título grande, subtítulo opcional y una única
   acción principal a la derecha (o abajo del todo en el móvil). */
export default function Cabecera({ titulo, subtitulo, accion, children }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">
            {titulo}
          </h1>
          {subtitulo && <p className="mt-1 text-tinta-suave">{subtitulo}</p>}
        </div>
        {accion}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  )
}
