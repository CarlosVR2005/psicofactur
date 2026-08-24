import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  BadgeEuro,
  CakeSlice,
  CalendarPlus,
  ChevronLeft,
  IdCard,
  Mail,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Sprout,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Boton from '../components/ui/Boton'
import Avatar from '../components/ui/Avatar'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Cargando from '../components/ui/Cargando'
import AvisoError from '../components/ui/AvisoError'
import DatoFicha from '../features/pacientes/DatoFicha'
import PacienteModal from '../features/pacientes/PacienteModal'
import ConsentimientoCard from '../features/pacientes/ConsentimientoCard'
import CitaModal from '../features/agenda/CitaModal'
import TipoCitaBadge from '../features/agenda/TipoCitaBadge'
import EstadoPagoBadge from '../features/facturacion/EstadoPagoBadge'
import { usePaciente } from '../hooks/usePacientes'
import { useCitasDePaciente } from '../hooks/useCitas'
import { useFacturas } from '../hooks/useFacturas'
import { cambiarActivo } from '../services/pacientes'
import { aClave, edad, etiquetaDia, fechaNumerica, hoy, MESES } from '../lib/fechas'
import { euros, eurosCorto, telefono } from '../lib/formato'

export default function PacienteDetallePage() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { paciente, cargando, error, recargar, setPaciente } = usePaciente(id)
  const { citas, recargar: recargarCitas } = useCitasDePaciente(id)
  const { facturas } = useFacturas(id)

  const [editando, setEditando] = useState(false)
  const [nuevaCita, setNuevaCita] = useState(false)
  const [confirmarArchivo, setConfirmarArchivo] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [errorAccion, setErrorAccion] = useState(null)

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
              {anos !== null && (
                <Badge tono="marca" tamano="sm">
                  {anos} años
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

      {/* Datos de contacto y económicos */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

        <div className="space-y-4">
          <ConsentimientoCard
            paciente={paciente}
            alCambiar={setPaciente}
            alEditarFicha={() => setEditando(true)}
          />

          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-tinta">
              <NotebookPen className="size-4.5 text-tinta-tenue" strokeWidth={1.9} />
              Observaciones
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-tinta-suave">
              {paciente.observaciones || 'Sin observaciones todavía.'}
            </p>
          </Card>

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

          {/* Archivar */}
          <Card className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
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
          </Card>
        </div>
      </div>

      <PacienteModal
        abierto={editando}
        alCerrar={() => setEditando(false)}
        paciente={paciente}
        alGuardar={setPaciente}
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
