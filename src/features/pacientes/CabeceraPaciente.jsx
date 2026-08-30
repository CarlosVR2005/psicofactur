import { Building2, CalendarPlus, Pencil, ShieldAlert } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Boton from '../../components/ui/Boton'
import {
  DIAS_CORTOS,
  MESES,
  deClave,
  edad,
  etiquetaDia,
  mesYAno,
  tiempoDesde,
} from '../../lib/fechas'
import { euros } from '../../lib/formato'
import { esMenorDeEdad } from '../../lib/menores'
import { TIPOS_CITA } from '../../lib/tipos'

/* ================================================================
   CABECERA DE LA FICHA

   El único bloque de la ficha sobre fondo eucalipto: separa a la
   persona de los datos, que van todos en tarjetas blancas debajo.

   La tira de cifras recoge lo que antes eran etiquetas sueltas
   (precio, nº de sesiones) y lo que estaba escondido en «Datos de
   contacto» (desde cuándo viene). Son datos, no estados: sólo el
   estado de verdad —archivado, menor, empresa— sigue como chip.
   ================================================================ */

const capitalizar = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)

/** 'Hoy' · 'Mañana' · 'Jue 18 sep' — compacto, para la tira. */
function fechaCitaCorta(clave) {
  const etiqueta = etiquetaDia(clave)
  if (etiqueta === 'Hoy' || etiqueta === 'Mañana' || etiqueta === 'Ayer') return etiqueta
  const f = deClave(clave)
  const dia = DIAS_CORTOS[(f.getDay() + 6) % 7]
  return `${dia} ${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)}`
}

function Cifra({ etiqueta, valor, apunte }) {
  return (
    <div className="border-l border-marca-200 px-4 pt-3.5 first:border-l-0 first:pl-0.5">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-marca-600">
        {etiqueta}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-tinta">
        {valor}
        {apunte && (
          <span className="mt-0.5 block text-sm font-medium tracking-normal text-tinta-tenue">
            {apunte}
          </span>
        )}
      </dd>
    </div>
  )
}

/**
 * @param {object}   props.paciente
 * @param {number}   props.sesiones      sesiones ya realizadas
 * @param {object?}  props.proximaCita   { fecha, hora, tipo } o null
 * @param {function} props.alEditar
 * @param {function} props.alNuevaCita
 */
export default function CabeceraPaciente({
  paciente,
  sesiones,
  proximaCita,
  alEditar,
  alNuevaCita,
}) {
  const anos = paciente.fechaNacimiento ? edad(paciente.fechaNacimiento) : null
  const menor = esMenorDeEdad(paciente.fechaNacimiento)
  const inicio = paciente.inicioTerapia

  const tipoProxima = proximaCita && TIPOS_CITA[proximaCita.tipo]

  return (
    <header className="rounded-2xl border border-marca-200 bg-gradient-to-b from-marca-50 to-marca-50/40 p-5 shadow-suave sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar nombre={paciente.nombre} tamano="xl" />

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-tinta">
            {paciente.nombre}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!paciente.activo && <Badge tono="neutro">Archivado</Badge>}
            {menor ? (
              <Badge tono="ambar" tamano="sm" icono={ShieldAlert}>
                Menor de edad{anos !== null && ` · ${anos} años`}
              </Badge>
            ) : (
              anos !== null && (
                <Badge tono="marca" tamano="sm">
                  {anos} años
                </Badge>
              )
            )}
            {paciente.tipoCliente === 'empresa' && (
              <Badge tono="azul" tamano="sm" icono={Building2}>
                Empresa
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Boton variante="secundario" icono={Pencil} onClick={alEditar}>
            Editar
          </Boton>
          <Boton icono={CalendarPlus} onClick={alNuevaCita}>
            Nueva cita
          </Boton>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 border-t border-marca-200 sm:grid-cols-4">
        <Cifra
          etiqueta="En terapia desde"
          valor={inicio ? capitalizar(mesYAno(deClave(inicio))) : '—'}
          apunte={inicio ? tiempoDesde(inicio) : undefined}
        />
        <Cifra etiqueta="Sesiones realizadas" valor={sesiones} />
        <Cifra
          etiqueta="Próxima cita"
          valor={proximaCita ? fechaCitaCorta(proximaCita.fecha) : '—'}
          apunte={
            proximaCita
              ? `${proximaCita.hora}${tipoProxima ? ` · ${tipoProxima.etiqueta.toLowerCase()}` : ''}`
              : 'sin programar'
          }
        />
        <Cifra etiqueta="Precio por sesión" valor={euros(paciente.precioSesion)} />
      </dl>
    </header>
  )
}
