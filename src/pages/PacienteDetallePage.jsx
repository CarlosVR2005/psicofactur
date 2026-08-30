import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  BadgeEuro,
  Building2,
  CakeSlice,
  CalendarPlus,
  ChevronLeft,
  IdCard,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  ShieldAlert,
  Sprout,
  Trash2,
  Users,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Boton from '../components/ui/Boton'
import Avatar from '../components/ui/Avatar'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Segmentado from '../components/ui/Segmentado'
import Cargando from '../components/ui/Cargando'
import AvisoError from '../components/ui/AvisoError'
import DatoFicha from '../features/pacientes/DatoFicha'
import PacienteModal from '../features/pacientes/PacienteModal'
import EliminarPacienteModal from '../features/pacientes/EliminarPacienteModal'
import ConsentimientoCard from '../features/pacientes/ConsentimientoCard'
import ObservacionesCard from '../features/pacientes/ObservacionesCard'
import HistoriaClinica from '../features/pacientes/HistoriaClinica'
import CitaModal from '../features/agenda/CitaModal'
import TipoCitaBadge from '../features/agenda/TipoCitaBadge'
import EstadoPagoBadge from '../features/facturacion/EstadoPagoBadge'
import { usePaciente } from '../hooks/usePacientes'
import { useCitasDePaciente } from '../hooks/useCitas'
import { useFacturas } from '../hooks/useFacturas'
import { cambiarActivo } from '../services/pacientes'
import { aClave, edad, etiquetaDia, fechaNumerica, hoy, MESES } from '../lib/fechas'
import { euros, eurosCorto, telefono } from '../lib/formato'
import { esMenorDeEdad, firmanLosProgenitores, progenitoresDe } from '../lib/menores'

export default function PacienteDetallePage() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { paciente, cargando, error, recargar, setPaciente } = usePaciente(id)
  const { citas, recargar: recargarCitas } = useCitasDePaciente(id)
  const { facturas } = useFacturas(id)

  const [params, setParams] = useSearchParams()
  const pestana = params.get('pestana') === 'historia' ? 'historia' : 'ficha'
  const cambiarPestana = (clave) =>
    setParams(
      (p) => {
        if (clave === 'historia') p.set('pestana', 'historia')
        else p.delete('pestana')
        return p
      },
      { replace: true },
    )

  const [editando, setEditando] = useState(false)
  const [nuevaCita, setNuevaCita] = useState(false)
  const [confirmarArchivo, setConfirmarArchivo] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [errorAccion, setErrorAccion] = useState(null)
  const [eliminarAbierto, setEliminarAbierto] = useState(false)

  if (cargando) return <Cargando texto="Cargando la ficha…" />

  if (error || !paciente) {
    return (
      <>
        <AvisoError
          error={error ?? 'No se ha encontrado ese paciente.'}
          alReintentar={recargar}
        />
        <div className="mt-4">
          <Boton variante="secundario" onClick={() => navegar('/pacientes')}>
            Volver a Pacientes
          </Boton>
        </div>
      </>
    )
  }

  const anos = paciente.fechaNacimiento ? edad(paciente.fechaNacimiento) : null
  const menor = esMenorDeEdad(paciente.fechaNacimiento)
  const progenitores = progenitoresDe(paciente)
  const inicio = paciente.inicioTerapia
  const claveHoy = aClave(hoy())
  // `citas` viene de más reciente a más antigua
  const proximas = citas.filter((c) => c.fecha >= claveHoy).reverse().slice(0, 5)
  const anteriores = citas.filter((c) => c.fecha < claveHoy)

  const alternarArchivo = async () => {
    setErrorAccion(null)
    setArchivando(true)
    const { data, error: fallo } = await cambiarActivo(paciente.id, !paciente.activo)
    setArchivando(false)
    setConfirmarArchivo(false)
    if (fallo) {
      setErrorAccion(fallo)
      return
    }
    setPaciente(data)
  }

  return (
    <>
      <Link
        to="/pacientes"
        className="mb-4 -ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
      >
        <ChevronLeft className="size-4" />
        Pacientes
      </Link>

      <AvisoError error={errorAccion} className="mb-4" />

      {/* Cabecera de la ficha */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
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
              <Badge tono="neutro" tamano="sm">
                {eurosCorto(paciente.precioSesion)} por sesión
              </Badge>
              <Badge tono="neutro" tamano="sm">
                {anteriores.length}{' '}
                {anteriores.length === 1 ? 'sesión' : 'sesiones'} realizadas
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Boton
              variante="secundario"
              icono={Pencil}
              onClick={() => setEditando(true)}
            >
              Editar
            </Boton>
            <Boton icono={CalendarPlus} onClick={() => setNuevaCita(true)}>
              Nueva cita
            </Boton>
          </div>
        </div>
      </Card>

      <div className="mt-4">
        <Segmentado
          opciones={[
            { id: 'ficha', etiqueta: 'Ficha' },
            { id: 'historia', etiqueta: 'Historia clínica' },
          ]}
          valor={pestana}
          alCambiar={cambiarPestana}
        />
      </div>

      {pestana === 'historia' ? (
        <div className="mt-4">
          <HistoriaClinica paciente={paciente} />
        </div>
      ) : (
       <>
      {/* Datos de contacto y económicos */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
       <div className="space-y-4">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 font-semibold text-tinta">Datos de contacto</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <DatoFicha
              icono={Phone}
              etiqueta="Teléfono"
              valor={paciente.telefono ? telefono(paciente.telefono) : ''}
              href={paciente.telefono ? `tel:+34${paciente.telefono}` : undefined}
            />
            <DatoFicha
              icono={MessageCircle}
              etiqueta="WhatsApp"
              valor={paciente.telefono ? 'Escribir mensaje' : ''}
              href={
                paciente.telefono ? `https://wa.me/34${paciente.telefono}` : undefined
              }
            />
            <DatoFicha
              icono={Mail}
              etiqueta="Correo"
              valor={paciente.correo}
              href={paciente.correo ? `mailto:${paciente.correo}` : undefined}
            />
            <DatoFicha icono={IdCard} etiqueta="DNI" valor={paciente.dni} />
            {paciente.tipoCliente === 'empresa' && (
              <>
                <DatoFicha
                  icono={Building2}
                  etiqueta="Empresa"
                  valor={paciente.empresaRazonSocial}
                  ayuda={paciente.empresaCif || undefined}
                />
                <DatoFicha
                  icono={Building2}
                  etiqueta="Domicilio fiscal"
                  valor={paciente.empresaDomicilio}
                />
              </>
            )}
            <DatoFicha
              icono={CakeSlice}
              etiqueta="Fecha de nacimiento"
              valor={
                paciente.fechaNacimiento ? fechaNumerica(paciente.fechaNacimiento) : ''
              }
              ayuda={anos !== null ? `${anos} años` : undefined}
            />
            <DatoFicha
              icono={Sprout}
              etiqueta="En terapia desde"
              valor={
                inicio
                  ? `${MESES[Number(inicio.slice(5, 7)) - 1]} de ${inicio.slice(0, 4)}`
                  : ''
              }
              ayuda={inicio ? fechaNumerica(inicio) : undefined}
            />
            <DatoFicha
              icono={BadgeEuro}
              etiqueta="Precio por sesión"
              valor={euros(paciente.precioSesion)}
            />
          </div>
        </Card>

        {(menor || progenitores.length > 0) && (
          <Card className="p-5 sm:p-6">
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-tinta">
              <Users className="size-4.5 text-tinta-tenue" strokeWidth={1.9} />
              Progenitores o tutores
            </h2>
            <p className="mb-4 text-sm text-tinta-suave">
              {firmanLosProgenitores(paciente.fechaNacimiento)
                ? 'Son ellos quienes firman el consentimiento y la cláusula de datos.'
                : 'Contacto de la familia del paciente.'}
            </p>

            {progenitores.length === 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3 text-sm leading-relaxed text-ambar">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
                <p>
                  Es un paciente menor de edad y no hay ningún progenitor
                  apuntado.{' '}
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="font-semibold underline underline-offset-2"
                  >
                    Añádelos en la ficha
                  </button>{' '}
                  para poder mandarles el consentimiento.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {progenitores.map((p) => (
                  <div key={p.rol}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                      {p.indice === 1
                        ? 'Primer progenitor o tutor'
                        : 'Segundo progenitor o tutor'}
                    </p>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <DatoFicha icono={Users} etiqueta="Nombre" valor={p.nombre} />
                      <DatoFicha icono={IdCard} etiqueta="DNI" valor={p.dni} />
                      <DatoFicha
                        icono={Phone}
                        etiqueta="Teléfono"
                        valor={p.telefono ? telefono(p.telefono) : ''}
                        href={p.telefono ? `tel:+34${p.telefono}` : undefined}
                      />
                      <DatoFicha
                        icono={Mail}
                        etiqueta="Correo"
                        valor={p.correo}
                        href={p.correo ? `mailto:${p.correo}` : undefined}
                      />
                    </div>
                  </div>
                ))}
                {menor && progenitores.some((p) => !p.correo) && (
                  <div className="flex items-start gap-3 rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3 text-sm leading-relaxed text-ambar">
                    <ShieldAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
                    <p>
                      Falta el correo de algún progenitor.{' '}
                      <button
                        type="button"
                        onClick={() => setEditando(true)}
                        className="font-semibold underline underline-offset-2"
                      >
                        Complétalo en la ficha
                      </button>
                      : sin correo no se le puede mandar el consentimiento.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
       </div>

        <div className="space-y-4">
          <ConsentimientoCard
            paciente={paciente}
            alRefrescar={recargar}
            alEditarFicha={() => setEditando(true)}
          />

          <ObservacionesCard paciente={paciente} alGuardar={setPaciente} />

          {/* Próximas citas */}
          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 font-semibold text-tinta">Próximas citas</h2>
            {proximas.length === 0 ? (
              <p className="text-sm text-tinta-suave">
                No tiene ninguna cita programada.
              </p>
            ) : (
              <ul className="divide-y divide-borde">
                {proximas.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="w-14 shrink-0 font-medium tabular-nums text-tinta">
                      {c.hora}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta-suave first-letter:uppercase">
                      {etiquetaDia(c.fecha)}
                    </span>
                    <TipoCitaBadge tipo={c.tipo} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Facturas del paciente */}
          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-tinta">Facturas</h2>
              <Link
                to="/facturacion"
                className="text-sm font-medium text-marca-600 hover:underline"
              >
                Ver todas
              </Link>
            </div>
            {facturas.length === 0 ? (
              <p className="text-sm text-tinta-suave">
                Aún no hay facturas emitidas a este paciente.
              </p>
            ) : (
              <ul className="divide-y divide-borde">
                {facturas.slice(0, 5).map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium tabular-nums text-tinta">{f.numero}</p>
                      <p className="truncate text-sm text-tinta-suave">
                        {f.fechaSesion
                          ? `Sesión del ${fechaNumerica(f.fechaSesion)}`
                          : `Emitida el ${fechaNumerica(f.fechaEmision)}`}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums text-tinta">
                      {euros(f.importe)}
                    </span>
                    <EstadoPagoBadge estado={f.estado} tamano="sm" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Archivar / eliminar */}
          <Card className="divide-y divide-borde p-0">
            <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-tinta">
                  {paciente.activo ? 'Archivar paciente' : 'Paciente archivado'}
                </h2>
                <p className="mt-0.5 text-sm text-tinta-suave">
                  {paciente.activo
                    ? 'Deja de aparecer en el listado, pero no se borra nada.'
                    : 'No aparece en el listado habitual. Puedes reactivarlo cuando quieras.'}
                </p>
              </div>
              <Boton
                variante={paciente.activo ? 'peligro' : 'secundario'}
                icono={paciente.activo ? Archive : ArchiveRestore}
                onClick={() =>
                  paciente.activo ? setConfirmarArchivo(true) : alternarArchivo()
                }
                disabled={archivando}
              >
                {paciente.activo ? 'Archivar' : 'Reactivar'}
              </Boton>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-tinta">Eliminar paciente</h2>
                <p className="mt-0.5 text-sm text-tinta-suave">
                  Borra la ficha para siempre. Sólo para fichas creadas por
                  error: si tiene facturas, no se puede.
                </p>
              </div>
              <Boton
                variante="peligro"
                tamano="sm"
                icono={Trash2}
                onClick={() => setEliminarAbierto(true)}
              >
                Eliminar
              </Boton>
            </div>
          </Card>
        </div>
      </div>
       </>
      )}

      <PacienteModal
        abierto={editando}
        alCerrar={() => setEditando(false)}
        paciente={paciente}
        alGuardar={setPaciente}
      />

      <EliminarPacienteModal
        abierto={eliminarAbierto}
        alCerrar={() => setEliminarAbierto(false)}
        paciente={paciente}
        alArchivar={() => setConfirmarArchivo(true)}
        alEliminado={({ citas }) =>
          navegar('/pacientes', {
            state: {
              aviso: {
                tipo: 'exito',
                titulo: `Se ha eliminado a ${paciente.nombre}`,
                detalle:
                  citas > 0
                    ? `Se han borrado también sus ${citas === 1 ? '1 cita' : `${citas} citas`}.`
                    : undefined,
              },
            },
          })
        }
      />

      <CitaModal
        abierto={nuevaCita}
        alCerrar={() => setNuevaCita(false)}
        pacienteId={paciente.id}
        alGuardar={recargarCitas}
      />

      <Modal
        abierto={confirmarArchivo}
        alCerrar={() => setConfirmarArchivo(false)}
        titulo="¿Archivar a este paciente?"
        descripcion={paciente.nombre}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setConfirmarArchivo(false)}>
              No, dejarlo como está
            </Boton>
            <Boton variante="peligro" onClick={alternarArchivo} disabled={archivando}>
              {archivando ? 'Archivando…' : 'Sí, archivar'}
            </Boton>
          </>
        }
      >
        <p className="leading-relaxed text-tinta-suave">
          Dejará de aparecer en el listado de pacientes, pero{' '}
          <strong className="text-tinta">no se borra nada</strong>: sus datos, sus
          citas y sus facturas siguen guardados. Puedes volver a activarlo en
          cualquier momento desde el filtro «Con archivados».
        </p>
      </Modal>
    </>
  )
}
