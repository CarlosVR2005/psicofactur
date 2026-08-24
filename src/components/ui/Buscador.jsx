import { Search, X } from 'lucide-react'

export default function Buscador({ valor, alCambiar, placeholder = 'Buscar…' }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-tinta-tenue" />
      <input
        type="search"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-borde-fuerte bg-white py-3 pl-11 pr-10 text-tinta placeholder:text-tinta-tenue focus:border-marca-400 focus:outline-none focus:ring-2 focus:ring-marca-200 [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button
          onClick={() => alCambiar('')}
          aria-label="Borrar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-tinta-tenue hover:bg-crema hover:text-tinta"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
