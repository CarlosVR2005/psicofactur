import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import Cargando from '../../components/ui/Cargando'
import AvisoError from '../../components/ui/AvisoError'
import { getFirmaConsentimiento } from '../../services/consentimiento'
import { fechaNumerica } from '../../lib/fechas'

/* ================================================================
   LA FIRMA REGISTRADA

   Lo que ella ve cuando quiere comprobar que un paciente firmó de
   verdad: el trazo, y al lado lo que lo convierte en prueba —cuándo,
   con qué DNI, desde qué IP y qué versión del texto se aceptó—.

   El trazo se pide AQUÍ y no viene con la ficha: son decenas de KB por
   paciente y no tiene sentido moverlos hasta que alguien quiere
   mirarlos.
   ================================================================ */

function Dato({ etiqueta, valor, ayuda }) {
  if (!valor) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">
        {etiqueta}
      </p>
      <p className="mt-0.5 text-tinta">{valor}</p>
      {ayuda && <p className="text-xs text-tinta-tenue">{ayuda}</p>}
    </div>
  )
}

const ROL_ETIQUETA = {
  PACIENTE: 'Firmado por el paciente',
  PROGENITOR_1: 'Firmado por el primer progenitor o tutor',
  PROGENITOR_2: 'Firmado por el segundo progenitor o tutor',
}

export default function FirmaModal({ abierto, alCerrar, paciente, firmante }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!abierto || !firmante?.id) return
    let vivo = true

    setCargando(true)
    setError(null)
    getFirmaConsentimiento(firmante.id).then(({ data, error: fallo }) => {
      if (!vivo) return
      setDatos(data)
      setError(fallo)
      setCargando(false)
    })

    return () => {
      vivo = false
    }
  }, [abierto, firmante?.id])

  /* El nombre que escribió al firmar y el de la ficha no tienen por qué
     coincidir: puede haber firmado un tutor, o haber añadido el segundo
     apellido que faltaba. Cuando difieren se dicen los dos, porque es
     justo el caso en el que ella querrá mirarlo. */
  const nombreDistinto =
    datos?.nombreFirmante &&
    datos.nombreFirmante.trim().toLowerCase() !==
      String(datos.nombreFicha ?? '').trim().toLowerCase()

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Consentimiento firmado"
      descripcion={paciente?.nombre}
      pie={
        <Boton variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      }
    >
      {cargando ? (
        <Cargando texto="Cargando la firma…" />
      ) : error ? (
        <AvisoError error={error} />
      ) : (
        <div className="space-y-5">
          {datos?.firma ? (
            <figure>
              <img
                src={datos.firma}
                alt={`Firma de ${datos.nombreFirmante || paciente?.nombre}`}
                className="w-full rounded-2xl border border-borde bg-white"
              />
              <figcaption className="mt-2 text-center text-xs text-tinta-tenue">
                Trazo tal como lo dibujó el paciente.
              </figcaption>
            </figure>
          ) : (
            <p className="text-tinta-suave">
              No hay ninguna firma guardada para este paciente.
            </p>
          )}

          {datos?.rol && datos.rol !== 'PACIENTE' && (
            <p className="rounded-xl bg-marca-50 px-3.5 py-2.5 text-sm text-marca-700">
              {ROL_ETIQUETA[datos.rol] ?? 'Firmado por un progenitor o tutor'}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Dato
              etiqueta="Firmado el"
              valor={
                datos?.fechaFirma
                  ? `${fechaNumerica(new Date(datos.fechaFirma))} a las ${new Date(
                      datos.fechaFirma,
                    ).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                  : ''
              }
            />
            <Dato etiqueta="DNI declarado" valor={datos?.dni} />
            <Dato
              etiqueta="Firmado por"
              valor={nombreDistinto ? datos.nombreFirmante : ''}
              ayuda={nombreDistinto ? `En la ficha consta como ${datos.nombreFicha}` : ''}
            />
            <Dato
              etiqueta="Desde la IP"
              valor={datos?.ip}
              ayuda="Se guarda para acreditar la firma"
            />
            <Dato
              etiqueta="Versión del texto"
              valor={datos?.version}
              ayuda="El clausulado que aceptó"
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
