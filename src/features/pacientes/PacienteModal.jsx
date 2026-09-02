import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import Segmentado from '../../components/ui/Segmentado'
import { Campo, Entrada, AreaTexto } from '../../components/ui/Campo'
import { actualizarPaciente, crearPaciente } from '../../services/pacientes'
import { aClave, hoy } from '../../lib/fechas'
import { esMenorDeEdad, progenitoresDe } from '../../lib/menores'
import { errorDeNif, normalizarNif } from '../../lib/nif'

const TIPOS_CLIENTE = [
  { id: 'particular', etiqueta: 'Particular' },
  { id: 'empresa', etiqueta: 'Empresa' },
]

const VACIO = {
  nombre: '',
  dni: '',
  telefono: '',
  correo: '',
  fechaNacimiento: '',
  precioSesion: 70,
  inicioTerapia: aClave(hoy()),
  observaciones: '',
  tipoCliente: 'particular',
  empresaRazonSocial: '',
  empresaCif: '',
  empresaDomicilio: '',
  progenitor1Nombre: '',
  progenitor1Dni: '',
  progenitor1Correo: '',
  progenitor1Telefono: '',
  progenitor2Nombre: '',
  progenitor2Dni: '',
  progenitor2Correo: '',
  progenitor2Telefono: '',
}

/**
 * @param {object}   props.paciente        si viene, se edita; si no, se crea
 * @param {function} props.alGuardar       recibe el paciente ya guardado en Supabase
 * @param {object[]} [props.otrosPacientes] lista para avisar si el DNI ya es de otra ficha
 */
export default function PacienteModal({ abierto, alCerrar, paciente, alGuardar, otrosPacientes }) {
  const [datos, setDatos] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!abierto) return
    setDatos(paciente ? { ...paciente } : VACIO)
    setError(null)
  }, [abierto, paciente])

  const cambiar = (campo) => (e) =>
    setDatos((d) => ({ ...d, [campo]: e.target.value }))

  /* ¿El DNI escrito ya es de otra ficha? Avisa, no bloquea: puede ser
     justo el caso que hay que fusionar, o un dedazo a tiempo. */
  const dniRepetido = useMemo(() => {
    const dni = normalizarNif(datos.dni || '')
    if (!dni || !otrosPacientes) return null
    return (
      otrosPacientes.find(
        (p) => p.id !== paciente?.id && p.dni && normalizarNif(p.dni) === dni,
      ) ?? null
    )
  }, [datos.dni, otrosPacientes, paciente?.id])

  const esEmpresa = datos.tipoCliente === 'empresa'
  const problemaCif = esEmpresa ? errorDeNif(datos.empresaCif) : null
  const empresaIncompleta =
    esEmpresa &&
    (!datos.empresaRazonSocial.trim() || !datos.empresaCif.trim() || Boolean(problemaCif))

  /* La sección de progenitores aparece sola en cuanto la fecha de
     nacimiento escrita da un menor de 18, y se queda si ya hay algún
     dato guardado aunque el paciente haya cumplido los 18. */
  const mostrarProgenitores =
    esMenorDeEdad(datos.fechaNacimiento) || progenitoresDe(datos).length > 0

  const enviar = async (e) => {
    e.preventDefault()
    if (empresaIncompleta) return
    setError(null)
    setGuardando(true)

    const { data, error: fallo } = paciente
      ? await actualizarPaciente(paciente.id, datos)
      : await crearPaciente(datos)

    setGuardando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    alGuardar?.(data)
    alCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={paciente ? 'Editar paciente' : 'Nuevo paciente'}
      descripcion={
        paciente
          ? paciente.nombre
          : 'Rellena los datos básicos, el resto se puede añadir luego.'
      }
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            type="submit"
            form="form-paciente"
            disabled={guardando || empresaIncompleta}
          >
            {guardando ? 'Guardando…' : 'Guardar paciente'}
          </Boton>
        </>
      }
    >
      <form id="form-paciente" onSubmit={enviar} className="space-y-4">
        <AvisoError error={error} />

        <Campo etiqueta="Nombre y apellidos">
          <Entrada
            required
            autoFocus
            value={datos.nombre}
            onChange={cambiar('nombre')}
            placeholder="Lucía Fernández Molina"
          />
        </Campo>

        <Campo
          etiqueta="Tipo de cliente"
          ayuda={
            esEmpresa
              ? 'Las facturas se emiten a nombre de la empresa, con retención de IRPF.'
              : 'La factura va a nombre de la persona, exenta y sin retención.'
          }
        >
          <Segmentado
            opciones={TIPOS_CLIENTE}
            valor={datos.tipoCliente}
            alCambiar={(v) => setDatos((d) => ({ ...d, tipoCliente: v }))}
          />
        </Campo>

        {esEmpresa && (
          <fieldset className="space-y-4 rounded-2xl border border-borde bg-crema/40 p-4">
            <legend className="px-1 text-sm font-medium text-tinta-suave">
              Datos de la empresa
            </legend>
            <Campo etiqueta="Razón social">
              <Entrada
                value={datos.empresaRazonSocial}
                onChange={cambiar('empresaRazonSocial')}
                placeholder="Empresa Ejemplo, S.L."
              />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="CIF"
                ayuda={problemaCif ? undefined : 'Se comprueba la letra de control.'}
              >
                <Entrada
                  value={datos.empresaCif}
                  onChange={cambiar('empresaCif')}
                  placeholder="B12345678"
                  aria-invalid={Boolean(problemaCif)}
                  className={
                    problemaCif ? 'border-rojo focus:border-rojo focus:ring-rojo/20' : ''
                  }
                />
                {problemaCif && (
                  <span className="mt-1 block text-xs text-rojo">{problemaCif}</span>
                )}
              </Campo>
              <Campo etiqueta="Domicilio fiscal">
                <Entrada
                  value={datos.empresaDomicilio}
                  onChange={cambiar('empresaDomicilio')}
                  placeholder="Calle, nº · CP Localidad"
                />
              </Campo>
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="DNI">
            <Entrada
              value={datos.dni}
              onChange={cambiar('dni')}
              placeholder="12345678A"
              aria-invalid={Boolean(dniRepetido)}
              className={
                dniRepetido ? 'border-ambar focus:border-ambar focus:ring-ambar/20' : ''
              }
            />
            {dniRepetido && (
              <span className="mt-1 block text-xs text-ambar">
                Ese DNI ya es de la ficha de «{dniRepetido.nombre}». Si es la misma
                persona, guárdala y fusiónalas desde la lista de pacientes.
              </span>
            )}
          </Campo>
          <Campo etiqueta="Teléfono">
            <Entrada
              type="tel"
              inputMode="tel"
              value={datos.telefono}
              onChange={cambiar('telefono')}
              placeholder="600 000 000"
            />
          </Campo>
        </div>

        <Campo etiqueta="Correo electrónico">
          <Entrada
            type="email"
            value={datos.correo}
            onChange={cambiar('correo')}
            placeholder="nombre@correo.com"
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Fecha de nacimiento">
            <Entrada
              type="date"
              value={datos.fechaNacimiento}
              onChange={cambiar('fechaNacimiento')}
            />
          </Campo>
          <Campo etiqueta="Precio por sesión (€)">
            <Entrada
              type="number"
              min="0"
              step="5"
              inputMode="numeric"
              value={datos.precioSesion}
              onChange={cambiar('precioSesion')}
            />
          </Campo>
        </div>

        <Campo etiqueta="Inicio de la terapia">
          <Entrada
            type="date"
            value={datos.inicioTerapia}
            onChange={cambiar('inicioTerapia')}
          />
        </Campo>

        {mostrarProgenitores && (
          <fieldset className="space-y-4 rounded-2xl border border-borde bg-crema/40 p-4">
            <legend className="px-1 text-sm font-medium text-tinta-suave">
              Progenitores o tutores legales
            </legend>
            <p className="text-xs text-tinta-tenue">
              Para el contacto y para mandarles el consentimiento y la cláusula
              de datos a cada uno. Por debajo de 16 años son ellos quienes lo
              firman.
            </p>

            {[1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  {i === 1 ? 'Primer progenitor o tutor' : 'Segundo progenitor o tutor'}
                </p>
                <Campo etiqueta="Nombre y apellidos">
                  <Entrada
                    value={datos[`progenitor${i}Nombre`]}
                    onChange={cambiar(`progenitor${i}Nombre`)}
                    placeholder="María Molina Sanz"
                  />
                </Campo>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="DNI">
                    <Entrada
                      value={datos[`progenitor${i}Dni`]}
                      onChange={cambiar(`progenitor${i}Dni`)}
                      placeholder="12345678A"
                    />
                  </Campo>
                  <Campo etiqueta="Teléfono">
                    <Entrada
                      type="tel"
                      inputMode="tel"
                      value={datos[`progenitor${i}Telefono`]}
                      onChange={cambiar(`progenitor${i}Telefono`)}
                      placeholder="600 000 000"
                    />
                  </Campo>
                </div>
                <Campo etiqueta="Correo electrónico">
                  <Entrada
                    type="email"
                    value={datos[`progenitor${i}Correo`]}
                    onChange={cambiar(`progenitor${i}Correo`)}
                    placeholder="nombre@correo.com"
                  />
                </Campo>
              </div>
            ))}
          </fieldset>
        )}

        <Campo etiqueta="Observaciones" ayuda="Notas privadas de la consulta.">
          <AreaTexto
            value={datos.observaciones}
            onChange={cambiar('observaciones')}
            placeholder="Motivo de consulta, preferencias de horario…"
          />
        </Campo>
      </form>
    </Modal>
  )
}
