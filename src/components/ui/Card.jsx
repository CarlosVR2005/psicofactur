/* Superficie base de la app: blanca, borde suave, esquinas amables. */
export default function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-borde bg-white shadow-suave ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
