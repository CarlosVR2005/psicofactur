/* Badge reutilizable: TODOS los estados de la app (tipo de cita,
   estado de pago, confirmación de WhatsApp) usan este componente,
   así la paleta no se descontrola. */

const TONOS = {
  neutro: 'bg-crema text-tinta-suave border-borde',
  marca: 'bg-marca-50 text-marca-700 border-marca-200',
  verde: 'bg-verde-suave text-verde border-verde/25',
  ambar: 'bg-ambar-suave text-ambar border-ambar/25',
  rojo: 'bg-rojo-suave text-rojo border-rojo/25',
  malva: 'bg-malva-suave text-malva border-malva/25',
  azul: 'bg-azul-suave text-azul border-azul/25',
}

const PUNTOS = {
  neutro: 'bg-tinta-tenue',
  marca: 'bg-marca-500',
  verde: 'bg-verde',
  ambar: 'bg-ambar',
  rojo: 'bg-rojo',
  malva: 'bg-malva',
  azul: 'bg-azul',
}

const TAMANOS = {
  sm: 'text-xs px-2 py-0.5 gap-1.5',
  md: 'text-sm px-2.5 py-1 gap-2',
}

export default function Badge({
  tono = 'neutro',
  tamano = 'md',
  punto = false,
  vivo = false, // añade el latido: "este estado se actualiza solo"
  icono: Icono,
  children,
  className = '',
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${TONOS[tono]} ${TAMANOS[tamano]} ${className}`}
    >
      {punto && (
        <span className={`relative flex ${tamano === 'sm' ? 'size-1.5' : 'size-2'}`}>
          <span
            className={`${PUNTOS[tono]} ${vivo ? 'latido' : ''} size-full rounded-full`}
          />
        </span>
      )}
      {Icono && <Icono className="size-3.5" strokeWidth={2.2} />}
      {children}
    </span>
  )
}
