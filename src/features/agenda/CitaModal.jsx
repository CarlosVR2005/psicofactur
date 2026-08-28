import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck2, Trash2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { Campo, Entrada, AreaTexto, Seleccion } from '../../components/ui/Campo'
import EstadoConfirmacionBadge from '../recordatorios/EstadoConfirmacionBadge'
import { usePacientes } from '../../hooks/usePacientes'
import { actualizarCita, crearCita, eliminarCita } from '../../services/citas'
import { LISTA_TIPOS, TIPOS_CITA } from '../../lib/tipos'
import { aClave, hoy } from '../../lib/fechas'

export default function CitaModal({
  abierto,
  alCerrar,
  cita, // si viene, se edita; si no, se crea
  fechaSugerida,
  horaSugerida,
  tipoSugerido, // lo usa la lista de espera: ya se sabe qué sesión pidió
  pacienteId,
  alGuardar, // recibe la cita guardada
  alEliminar, // recibe el id eliminado
}) {
  const { pacientes, cargando: cargandoPacientes } = usePacientes()
  const [datos, setDatos] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    setConfirmarBorrado(false)
    const tipo = tipoSugerido ?? 'individual'
    setDatos(
      cita
        ? { ...cita }
        : {
            pacienteId: pacienteId ?? '',
            acompananteId: null,
            fecha: fechaSugerida ?? aClave(hoy()),
            // La que se pulsó en el hueco libre; si no, media mañana
            hora: horaSugerida ?? '10:00',
            tipo,
            duracion: TIPOS_CITA[tipo].duracion,
            notas: '',
          },
    )
  }, [abierto, cita, fechaSugerida, horaSugerida, tipoSugerido, pacienteId])

  // Cuando llega la lista de pacientes, preseleccionar el primero
  useEffect(() => {
    if (!abierto || cita) return
    setDatos((d) =>
      d && !d.pacienteId && pacientes.length ? { ...d, pacienteId: pacientes[0].id } : d,
    )
  }, [abierto, cita, pacientes])

  if (!datos) return null

  const cancelada = cita?.confirmacion === 'cancelada'

  const cambiar = (campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }))

  const cambiarTipo = (tipo) =>
    setDatos((d) => ({
      ...d,
      tipo,
      duracion: TIPOS_CITA[tipo].duracion,
      acompananteId: tipo === 'pareja' ? d.acompananteId : null,
    }))

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)
    setGuardando(true)

    const { data, error: fallo, aviso } = cita
      ? await actualizarCita(cita.id, datos, {
          // Reprogramar una cita que el paciente canceló: vuelve a la
          // espera de que confirme la nueva hora
          reactivar: cita.confirmacion === 'cancelada',
        })
      : await crearCita(datos)

    setGuardando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    // La cita está guardada; `aviso` sólo aparece si Google Calendar falló
    alGuardar?.(data, aviso)
    alCerrar()
  }

  const borrar = async () => {
    setError(null)
    setGuardando(true)
    const { error: fallo, aviso } = await eliminarCita(cita)
    setGuardando(false)
    if (fallo) {
      setError(fallo)
      setConfirmarBorrado(false)
      return
    }
    alEliminar?.(cita.id, aviso)
    alCerrar()
  }

  const sinPacientes = !cargandoPacientes && pacientes.length === 0

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={cita ? 'Editar cita' : 'Nueva cita'}
      descripcion={
        cita ? 'Cambia lo que necesites y guarda.' : 'Se añadirá a la agenda al guardar.'
      }
      pie={
        <>
          {cita && (
            <Boton
              variante="peligro"
              icono={Trash2}
              onClick={() => setConfirmarBorrado(true)}
              disabled={guardando}
              className="sm:mr-auto"
            >
              Eliminar
            </Boton>
          )}
          <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            type="submit"
            form="form-cita"
            disabled={guardando || sinPacientes}
          >
            {guardando
              ? 'Guardando…'
              : cita
                ? cancelada
                  ? 'Reprogramar cita'
                  : 'Guardar cambios'
                : 'Crear cita'}
          </Boton>
        </>
      }
    >
      {confirmarBorrado ? (
        <div className="space-y-4">
          <p className="leading-relaxed text-tinta">
            ¿Seguro que quieres eliminar esta cita del{' '}
            <strong>{datos.fecha.split('-').reverse().join('/')}</strong> a las{' '}
            <strong>{datos.hora}</strong>?
          </p>
          <p className="text-sm text-tinta-suave">
            Se borra de la agenda y no se puede deshacer.
          </p>
          <AvisoError error={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Boton
              variante="secundario"
              onClick={() => setConfirmarBorrado(false)}
              className="sm:flex-1"
            >
              No, volver
            </Boton>
            <Boton
              variante="peligro"
              onClick={borrar}
              disabled={guardando}
              className="sm:flex-1"
            >
              {guardando ? 'Eliminando…' : 'Sí, eliminar'}
            </Boton>
          </div>
        </div>
      ) : (
        <form id="form-cita" onSubmit={enviar} className="space-y-4">
          <AvisoError error={error} />

          {sinPacientes && (
            <p className="rounded-xl border border-dashed border-borde-fuerte bg-crema px-4 py-3 text-sm text-tinta-suave">
              Todavía no hay pacientes.{' '}
              <Link to="/pacientes" className="font-medium text-marca-600 underline">
                Añade el primero
              </Link>{' '}
              y luego vuelve a la agenda.
            </p>
          )}

          {/* Tipo de cita: botones grandes con su color, nada de menús */}
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-tinta-suave">
              Tipo de sesión
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {LISTA_TIPOS.map((t) => {
                const activo = datos.tipo === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => cambiarTipo(t.id)}
                    aria-pressed={activo}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
                      activo
                        ? `${t.chip} shadow-suave`
                        : 'border-borde bg-white text-tinta-suave hover:bg-crema'
                    }`}
                  >
                    <span className={`size-2.5 rounded-full ${t.punto}`} />
                    {t.etiqueta}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <Campo etiqueta={datos.tipo === 'pareja' ? 'Paciente 1' : 'Paciente'}>
            <Seleccion
              required
              value={datos.pacienteId}
              onChange={(e) => cambiar('pacienteId', e.target.value)}
              disabled={cargandoPacientes || sinPacientes}
            >
              {cargandoPacientes && <option>Cargando pacientes…</option>}
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Seleccion>
          </Campo>

          {datos.tipo === 'pareja' && (
            <Campo
              etiqueta="Paciente 2"
              ayuda="La otra persona de la pareja. Debe tener su propia ficha."
            >
              <Seleccion
                value={datos.acompananteId ?? ''}
                onChange={(e) => cambiar('acompananteId', e.target.value || null)}
              >
                <option value="">Sin registrar</option>
                {pacientes
                  .filter((p) => p.id !== datos.pacienteId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </Seleccion>
            </Campo>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Fecha" className="sm:col-span-2">
              <Entrada
                type="date"
                required
                value={datos.fecha}
                onChange={(e) => cambiar('fecha', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Hora">
              <Entrada
                type="time"
                required
                step="300"
                value={datos.hora}
                onChange={(e) => cambiar('hora', e.target.value)}
              />
            </Campo>
          </div>

          <Campo etiqueta="Duración (minutos)">
            <Entrada
              type="number"
              min="15"
              step="5"
              inputMode="numeric"
              value={datos.duracion}
              onChange={(e) => cambiar('duracion', e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Notas de la sesión">
            <AreaTexto
              rows={3}
              value={datos.notas}
              onChange={(e) => cambiar('notas', e.target.value)}
              placeholder="Cualquier cosa que quieras recordar antes de la sesión…"
            />
          </Campo>

          {/* Sólo al editar: información que NO se toca desde aquí */}
          {cita && (
            <div className="space-y-4 rounded-2xl bg-crema p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-tinta-suave">
                  Confirmación del paciente
                </span>
                <EstadoConfirmacionBadge estado={cita.confirmacion} tamano="sm" />
              </div>
              <p className="text-xs text-tinta-tenue">
                Lo marca Confirmafy en tu Google Calendar según responda el
                paciente: 🟢 confirmada · 🟡 pendiente · 🔴 cancelada.
              </p>
              {cancelada && (
                <p className="rounded-xl bg-rojo-suave px-3 py-2 text-xs leading-relaxed text-rojo">
                  El paciente canceló esta cita. Cambia la fecha o la hora y pulsa
                  «Reprogramar cita»: su hueco queda libre para la lista de espera.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-tinta-suave">
                  Google Calendar
                </span>
                <span className="flex items-center gap-1.5 text-sm text-tinta-suave">
                  {cita.googleEventId ? (
                    <>
                      <CalendarCheck2 className="size-4 text-verde" strokeWidth={2} />
                      En tu calendario
                    </>
                  ) : (
                    'Sin sincronizar'
                  )}
                </span>
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  )
}
