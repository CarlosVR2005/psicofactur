import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { Campo, Entrada, AreaTexto } from '../../components/ui/Campo'
import { actualizarPaciente, crearPaciente } from '../../services/pacientes'
import { aClave, hoy } from '../../lib/fechas'

const VACIO = {
  nombre: '',
  dni: '',
  telefono: '',
  correo: '',
  fechaNacimiento: '',
  precioSesion: 60,
  inicioTerapia: aClave(hoy()),
  observaciones: '',
}

/**
 * @param {object}   props.paciente   si viene, se edita; si no, se crea
 * @param {function} props.alGuardar  recibe el paciente ya guardado en Supabase
 */
export default function PacienteModal({ abierto, alCerrar, paciente, alGuardar }) {
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

  const enviar = async (e) => {
    e.preventDefault()
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
          <Boton type="submit" form="form-paciente" disabled={guardando}>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="DNI">
            <Entrada
              value={datos.dni}
              onChange={cambiar('dni')}
              placeholder="12345678A"
            />
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
