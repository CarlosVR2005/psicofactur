import { useEffect, useState } from 'react'
import { Archive, TriangleAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import Cargando from '../../components/ui/Cargando'
import AvisoError from '../../components/ui/AvisoError'
import { Campo, Entrada } from '../../components/ui/Campo'
import { normalizar } from '../../lib/formato'
import { eliminarPaciente, historialDePaciente } from '../../services/pacientes'

/* El nombre guardado puede venir de una importación con un espacio
   doble, un espacio no separable (NBSP) o un carácter de ancho cero
   pegado: invisibles, pero hacían que la confirmación no cuadrara nunca
   y el botón se quedara muerto aunque estuviera bien escrito. Se compara
   sin tildes, con los espacios colapsados y sin caracteres invisibles. */
function mismoNombre(escrito, real) {
  const limpio = (s) =>
    normalizar(s)
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // caracteres de ancho cero
      .replace(/\s+/g, ' ') // NBSP y espacios repetidos -> uno solo
      .trim()
  const objetivo = limpio(real)
  return objetivo !== '' && limpio(escrito) === objetivo
}

/* ================================================================
   ELIMINAR PACIENTE — la única acción irreversible de la aplicación

   Archivar (la tarjeta de al lado) es lo normal: el paciente termina y
   su histórico se queda. Esto es para la ficha que nunca debió existir
   —un dedazo, una importación torcida— y no hay nada que conservar.

   Dos caminos según lo que devuelva `historialDePaciente`:

   · Con facturas: no se puede, y punto. Se explica por qué y sólo se
     ofrece archivar. La regla de verdad está en la base (función
     `eliminar_paciente`, migración 0020); esto es sólo para no llevar a
     nadie a un botón que va a fallar.
   · Sin facturas: se enumera lo que se va a perder y se pide escribir
     el nombre del paciente. Un «¿seguro?» se pulsa sin leer; copiar el
     nombre obliga a parar.
   ================================================================ */
export default function EliminarPacienteModal({
  abierto,
  alCerrar,
  paciente,
  alArchivar,
  alEliminado,
}) {
  const [historial, setHistorial] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!abierto || !paciente?.id) return
    let vivo = true

    setHistorial(null)
    setConfirmacion('')
    setError(null)
    setCargando(true)
    historialDePaciente(paciente.id).then(({ data, error: fallo }) => {
      if (!vivo) return
      setHistorial(data)
      setError(fallo)
      setCargando(false)
    })

    return () => {
      vivo = false
    }
  }, [abierto, paciente?.id])

  if (!paciente) return null

  const tieneFacturas = historial ? historial.facturas > 0 : false
  const nombreOk = mismoNombre(confirmacion, paciente.nombre)

  const eliminar = async () => {
    if (!nombreOk || eliminando) return
    setError(null)
    setEliminando(true)
    const { data, error: fallo } = await eliminarPaciente(paciente.id)
    setEliminando(false)
    if (fallo) {
      setError(fallo)
      // La base ha visto una factura que el histórico no tenía todavía
      if (fallo.tieneFacturas) setHistorial({ facturas: 1, citas: historial?.citas ?? 0 })
      return
    }
    alEliminado?.(data)
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Eliminar paciente"
      descripcion={paciente.nombre}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={eliminando}>
            Cancelar
          </Boton>
          {tieneFacturas ? (
            <Boton
              icono={Archive}
              onClick={() => {
                alCerrar()
                alArchivar?.()
              }}
            >
              Archivar en su lugar
            </Boton>
          ) : (
            <Boton
              variante="peligro"
              onClick={eliminar}
              disabled={cargando || eliminando || !nombreOk}
            >
              {eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
            </Boton>
          )}
        </>
      }
    >
      {cargando ? (
        <Cargando texto="Comprobando el histórico…" />
      ) : (
        <div className="space-y-4">
          <AvisoError error={error} />

          {tieneFacturas ? (
            <div className="flex items-start gap-3 rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3.5 text-sm leading-relaxed text-ambar">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
              <p>
                <strong>{paciente.nombre}</strong> tiene{' '}
                {historial.facturas === 1
                  ? 'una factura emitida'
                  : `${historial.facturas} facturas emitidas`}
                . No se puede borrar: las facturas hay que conservarlas por
                obligación fiscal y están declaradas en Verifactu. Archívalo y
                dejará de aparecer en el listado sin perder nada.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-rojo/30 bg-rojo-suave px-4 py-3.5 text-sm leading-relaxed text-rojo">
                <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
                <div>
                  <p className="font-medium">Esto no se puede deshacer.</p>
                  <p className="mt-1">
                    Se borrará la ficha
                    {historial?.citas > 0 && (
                      <>
                        {' '}
                        y sus{' '}
                        {historial.citas === 1
                          ? '1 cita'
                          : `${historial.citas} citas`}
                      </>
                    )}
                    {paciente.consentimientoEstado === 'FIRMADO' && (
                      <>, junto con el consentimiento que firmó</>
                    )}
                    . Si sólo quieres que deje de aparecer en el listado, usa
                    «Archivar».
                  </p>
                </div>
              </div>

              <Campo
                etiqueta="Escribe el nombre del paciente para confirmar"
                ayuda={paciente.nombre}
              >
                <Entrada
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  autoComplete="off"
                  placeholder={paciente.nombre}
                />
              </Campo>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
