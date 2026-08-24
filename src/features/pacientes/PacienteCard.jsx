import { Link } from 'react-router-dom'
import { ChevronRight, Phone } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import ConsentimientoBadge from './ConsentimientoBadge'
import { eurosCorto, telefono } from '../../lib/formato'
import { edad } from '../../lib/fechas'

export default function PacienteCard({ paciente }) {
  const anos = paciente.fechaNacimiento ? edad(paciente.fechaNacimiento) : null

  return (
    <Link
      to={`/pacientes/${paciente.id}`}
      className={`flex items-center gap-3 rounded-2xl border border-borde bg-white px-4 py-3.5 shadow-suave transition-colors hover:border-marca-200 hover:bg-marca-50/40 sm:gap-4 ${
        paciente.activo ? '' : 'opacity-70'
      }`}
    >
      <Avatar nombre={paciente.nombre} tamano="md" />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium text-tinta">
          <span className="truncate">{paciente.nombre}</span>
          {!paciente.activo && (
            <Badge tono="neutro" tamano="sm">
              Archivado
            </Badge>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-tinta-suave">
          {paciente.telefono ? (
            <>
              <Phone className="size-3.5 shrink-0" strokeWidth={2} />
              {telefono(paciente.telefono)}
            </>
          ) : (
            <span className="text-tinta-tenue">Sin teléfono</span>
          )}
          {anos !== null && (
            <>
              <span className="text-tinta-tenue">·</span>
              {anos} años
            </>
          )}
        </p>
      </div>

      {/* Sólo cuando dice algo: «sin enviar» es el caso de casi todas
          las fichas y llenaría el listado de gris. */}
      <ConsentimientoBadge
        estado={paciente.consentimientoEstado}
        tamano="sm"
        mostrarSinEnviar={false}
        etiqueta={paciente.consentimientoEstado === 'FIRMADO' ? 'Firmado' : 'Sin firmar'}
      />

      <span className="hidden text-sm font-medium text-tinta-suave lg:block">
        {eurosCorto(paciente.precioSesion)}/sesión
      </span>

      <ChevronRight className="size-5 shrink-0 text-tinta-tenue" />
    </Link>
  )
}
