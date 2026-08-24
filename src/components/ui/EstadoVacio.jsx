export default function EstadoVacio({ icono: Icono, titulo, texto, accion }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-borde-fuerte bg-white/60 px-6 py-14 text-center">
      {Icono && (
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-marca-50 text-marca-500">
          <Icono className="size-7" strokeWidth={1.8} />
        </span>
      )}
      <p className="font-medium text-tinta">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-tinta-suave">{texto}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}
