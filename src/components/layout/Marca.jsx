/* Logotipo: una silueta sencilla dentro de un círculo. Sobrio y cercano. */
export default function Marca({ className = 'size-9' }) {
  return (
    <span
      className={`flex items-center justify-center rounded-2xl bg-marca-500 text-white ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        <circle cx="12" cy="8" r="3.4" fill="currentColor" />
        <path
          d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
