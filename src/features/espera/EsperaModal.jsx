import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { Campo, Entrada, AreaTexto, Seleccion } from '../../components/ui/Campo'
import { usePacientes } from '../../hooks/usePacientes'
import { actualizarEspera, anadirAEspera } from '../../services/listaEspera'
import { LISTA_FRANJAS, ventanaSemana } from '../../lib/espera'
import { LISTA_TIPOS } from '../../lib/tipos'

/* Apuntar a alguien en la lista de espera.

   Los atajos de semana son lo importante del formulario: quien llama
   pidiendo hueco dice «esta semana» o «la que viene», no dos fechas.
   Se pueden afinar a mano después, pero de un toque ya está puesto. */
const ATAJOS = [
  { id: 'esta', etiqueta: 'Esta semana', ventana: () => ventanaSemana(0) },
  { id: 'siguiente', etiqueta: 'La que viene', ventana: () => ventanaSemana(1) },
]

export default function EsperaModal({
  abierto,
  alCerrar,
  espera, // si viene, se edita; si no, se apunta a alguien nuevo
  alGuardar,
}) {
  const { pacientes, cargando: cargandoPacientes } = usePacientes()
  const [datos, setDatos] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    setDatos(
      espera
        ? { ...espera }
        : {
            pacienteId: '',
            ...ventanaSemana(0),
            franja: 'cualquiera',
            tipo: 'individual',
            nota: '',
          },
    )
  }, [abierto, espera])

  // Cuando llega la lista de pacientes, preseleccionar el primero
  useEffect(() => {
    if (!abierto || espera) return
    setDatos((d) =>
      d && !d.pacienteId && pacientes.length ? { ...d, pacienteId: pacientes[0].id } : d,
    )
  }, [abierto, espera, pacientes])

  if (!datos) return null

  const cambiar = (campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }))

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)
    setGuardando(true)

    const { data, error: fallo } = espera
      ? await actualizarEspera(espera.id, datos)
      : await anadirAEspera(datos)

    setGuardando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    alGuardar?.(data)
    alCerrar()
  }

  const sinPacientes = !cargandoPacientes && pacientes.length === 0

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={espera ? 'Editar la espera' : 'Apuntar en la lista de espera'}
      descripcion={
        espera
          ? 'Cambia lo que necesites y guarda.'
          : 'Cuando se cancele una cita que le encaje, aparecerá aquí.'
      }
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" form="form-espera" disabled={guardando || sinPacientes}>
            {guardando ? 'Guardando…' : espera ? 'Guardar cambios' : 'Apuntar'}
          </Boton>
        </>
      }
    >
      <form id="form-espera" onSubmit={enviar} className="space-y-4">
        <AvisoError error={error} />

        {sinPacientes && (
          <p className="rounded-xl border border-dashed border-borde-fuerte bg-crema px-4 py-3 text-sm text-tinta-suave">
            Todavía no hay pacientes.{' '}
            <Link to="/pacientes" className="font-medium text-marca-600 underline">
              Añade el primero
            </Link>{' '}
            y luego vuelve aquí.
          </p>
        )}

        <Campo etiqueta="Quién espera">
          <Seleccion
            required
            value={datos.pacienteId}
            onChange={(e) => cambiar('pacienteId', e.target.value)}
            disabled={cargandoPacientes || sinPacientes || Boolean(espera)}
          >
            {cargandoPacientes && <option>Cargando pacientes…</option>}
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Seleccion>
        </Campo>

        {/* Atajos de semana: lo que de verdad se pide por teléfono */}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-tinta-suave">
            ¿Para cuándo lo quiere?
          </legend>
          <div className="mb-3 flex flex-wrap gap-2">
            {ATAJOS.map((a) => {
              const v = a.ventana()
              const activo = datos.desde === v.desde && datos.hasta === v.hasta
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setDatos((d) => ({ ...d, ...v }))}
                  aria-pressed={activo}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    activo
                      ? 'border-marca-200 bg-marca-50 text-marca-700'
                      : 'border-borde bg-white text-tinta-suave hover:bg-crema'
                  }`}
                >
                  {a.etiqueta}
                </button>
              )
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Desde">
              <Entrada
                type="date"
                required
                value={datos.desde}
                onChange={(e) => cambiar('desde', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Hasta">
              <Entrada
                type="date"
                required
                min={datos.desde}
                value={datos.hasta}
                onChange={(e) => cambiar('hasta', e.target.value)}
              />
            </Campo>
          </div>
        </fieldset>

        <Campo etiqueta="Franja que le viene bien">
          <Seleccion
            value={datos.franja}
            onChange={(e) => cambiar('franja', e.target.value)}
          >
            {LISTA_FRANJAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.etiqueta}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Tipo de sesión">
          <Seleccion value={datos.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
            {LISTA_TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.etiqueta}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Nota">
          <AreaTexto
            rows={2}
            value={datos.nota}
            onChange={(e) => cambiar('nota', e.target.value)}
            placeholder="«Sólo puede jueves», «avisar al móvil de la madre»…"
          />
        </Campo>
      </form>
    </Modal>
  )
}
