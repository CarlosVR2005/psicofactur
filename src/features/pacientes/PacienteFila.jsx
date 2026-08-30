import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import ConsentimientoBadge from './ConsentimientoBadge'
import { deClave, edad, mesYAno } from '../../lib/fechas'
import { esMenorDeEdad } from '../../lib/menores'

const capitalizar = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)

/* Una fila del listado de pacientes. Ligera a propósito: el listado
   puede tener cientos de líneas, así que nada de tarjeta con sombra por
   fila — van dentro de una sola tarjeta separadas por filete. */
export default function PacienteFila({ paciente }) {
  const anos = paciente.fechaNacimiento ? edad(paciente.fechaNacimiento) : null
  const menor = esMenorDeEdad(paciente.fechaNacimiento)
  const desde = paciente.inicioTerapia
    ? `Desde ${capitalizar(mesYAno(deClave(paciente.inicioTerapia)))}`
    : null

  const meta = [desde, anos !== null && `${anos} años`].filter(Boolean).join('  ·  ')

  return (
    <Link
      to={`/pacientes/${paciente.id}`}
      className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-marca-50/50 sm:gap-4 ${
        paciente.activo ? '' : 'opacity-70'
      }`}
    >
      <Avatar nombre={paciente.nombre} tamano="md" />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium text-tinta">
          <span className="truncate">{paciente.nombre}</span>
          {!paciente.activo && (
            <Badge tono="neutro" tamano="sm" className="shrink-0">
              Archivado
            </Badge>
          )}
          {menor && (
            <Badge tono="ambar" tamano="sm" className="shrink-0">
              Menor
            </Badge>
          )}
          {paciente.tipoCliente === 'empresa' && (
            <Badge tono="azul" tamano="sm" className="shrink-0">
              Empresa
            </Badge>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm text-tinta-suave">
          {meta || 'Ficha sin completar'}
        </p>
      </div>

      {/* Sólo cuando dice algo: «sin enviar» es el caso de casi todas
          las fichas y llenaría el listado de gris. */}
      <ConsentimientoBadge
        estado={paciente.consentimientoEstado}
        tamano="sm"
        mostrarSinEnviar={false}
        etiqueta={paciente.consentimientoEstado === 'FIRMADO' ? 'Firmado' : 'Pendiente'}
      />

      <ChevronRight className="size-5 shrink-0 text-tinta-tenue transition-colors group-hover:text-marca-500" />
    </Link>
  )
}
