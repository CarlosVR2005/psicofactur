/* Conmutador de dos o tres opciones (Semana / Mes, Todas / Pendientes…). */
export default function Segmentado({ opciones, valor, alCambiar, className = '' }) {
  return (
    <div
      role="tablist"
      className={`inline-flex rounded-xl border border-borde bg-white p-1 ${className}`}
    >
      {opciones.map((op) => {
        const activa = op.id === valor
        return (
          <button
            key={op.id}
            role="tab"
            aria-selected={activa}
            onClick={() => alCambiar(op.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              activa
                ? 'bg-marca-50 text-marca-700'
                : 'text-tinta-suave hover:text-tinta'
            }`}
          >
            {op.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
