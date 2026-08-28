/* Logotipo de la consulta. El archivo vive en /public y es un badge
   circular con su propio fondo, así que aquí sólo se le da tamaño y se
   recorta a círculo para que las esquinas no canten sobre fondo blanco. */
export default function Marca({ className = 'size-9' }) {
  return (
    <img
      src="/logo-psicofactur.png"
      alt="Psicofactur"
      className={`shrink-0 rounded-full object-contain ${className}`}
    />
  )
}
