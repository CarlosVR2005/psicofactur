import { useCallback, useEffect, useState } from 'react'
import { Eye, Loader2, Mail, Send } from 'lucide-react'
import Card from '../../components/ui/Card'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import ConsentimientoBadge from './ConsentimientoBadge'
import FirmaModal from './FirmaModal'
import { enviarConsentimiento, getFirmantes } from '../../services/consentimiento'
import { fechaNumerica } from '../../lib/fechas'
import { firmanLosProgenitores } from '../../lib/menores'

/* ================================================================
   CONSENTIMIENTO INFORMADO — el bloque de la ficha del paciente

   Un adulto tiene un firmante; un menor de 16, uno por progenitor, cada
   uno con su enlace y su firma. La tarjeta enseña la lista: quién ha
   firmado y quién falta.

   El botón principal manda el enlace a quien toque (lo decide el
   servidor por la fecha de nacimiento). El reenvío es a propósito el
   menos visible: cada reenvío invalida el enlace anterior.
   ================================================================ */

const ROL_ETIQUETA = {
  PACIENTE: 'El paciente',
  PROGENITOR_1: 'Primer progenitor o tutor',
  PROGENITOR_2: 'Segundo progenitor o tutor',
}

export default function ConsentimientoCard({ paciente, alRefrescar, alEditarFicha }) {
  const [firmantes, setFirmantes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [firmaAbierta, setFirmaAbierta] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    const { data } = await getFirmantes(paciente.id)
    setFirmantes(data ?? [])
    setCargando(false)
  }, [paciente.id])

  useEffect(() => {
    recargar()
  }, [recargar])

  const porProgenitores = firmanLosProgenitores(paciente.fechaNacimiento)
  const hayEnviados = firmantes.length > 0
  const todosFirmados = hayEnviados && firmantes.every((f) => f.estado === 'FIRMADO')
  const estadoResumen = !hayEnviados
    ? 'NO_ENVIADO'
    : todosFirmados
      ? 'FIRMADO'
      : 'PENDIENTE'

  const enviar = async () => {
    if (enviando) return
    setError(null)
    setResultado(null)
    setEnviando(true)
    const { data, error: fallo } = await enviarConsentimiento(paciente.id)
    setEnviando(false)

    if (fallo) {
      setError(fallo)
      return
    }

    setResultado(data)
    await recargar()
    alRefrescar?.()
  }

  const textoBoton = todosFirmados
    ? null
    : hayEnviados
      ? 'Volver a enviarlo'
      : porProgenitores
        ? 'Enviar a los progenitores'
        : 'Enviar consentimiento'

  return (
    <>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-tinta">Consentimiento informado</h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              {porProgenitores
                ? 'Es menor de 16 años: lo firman sus dos progenitores, cada uno con su enlace.'
                : 'Se le manda por correo y lo firma desde el móvil.'}
            </p>
          </div>
          <ConsentimientoBadge estado={estadoResumen} />
        </div>

        {/* Lista de firmantes */}
        {!cargando && hayEnviados && (
          <ul className="mt-4 divide-y divide-borde rounded-2xl border border-borde">
            {firmantes.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-tinta">
                    {ROL_ETIQUETA[f.rol] ?? f.rol}
                  </p>
                  <p className="truncate text-xs text-tinta-suave">
                    {f.estado === 'FIRMADO'
                      ? f.fechaFirma
                        ? `Firmado el ${fechaNumerica(new Date(f.fechaFirma))}`
                        : 'Firmado'
                      : f.destinatarioCorreo
                        ? `Enviado a ${f.destinatarioCorreo}`
                        : 'Pendiente de firma'}
                  </p>
                </div>
                <ConsentimientoBadge estado={f.estado} tamano="sm" />
                {f.estado === 'FIRMADO' && (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    icono={Eye}
                    onClick={() => setFirmaAbierta(f)}
                  >
                    Ver
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        )}

        {resultado && (
          <div className="mt-3 space-y-2">
            {resultado.envios
              .filter((e) => e.ok)
              .map((e) => (
                <p
                  key={e.rol}
                  className="rounded-xl bg-verde-suave px-3.5 py-2.5 text-sm text-verde"
                >
                  Enviado a {e.destinatario}. Le llegará un enlace para firmarlo.
                </p>
              ))}
            {resultado.envios
              .filter((e) => !e.ok)
              .map((e) => (
                <p
                  key={e.rol}
                  className="rounded-xl bg-rojo-suave px-3.5 py-2.5 text-sm text-rojo"
                >
                  No se ha podido enviar a {e.destinatario}. {e.mensaje}
                </p>
              ))}
            {resultado.aviso && (
              <p className="rounded-xl bg-ambar-suave px-3.5 py-2.5 text-sm text-ambar">
                {resultado.aviso}
              </p>
            )}
          </div>
        )}

        <AvisoError error={error} className="mt-3" />

        {/* El correo que falta no se arregla reintentando: se ofrece
            ir a corregir la ficha. */}
        {(error?.sinEmail || error?.faltanProgenitores) && alEditarFicha && (
          <div className="mt-3">
            <Boton variante="secundario" tamano="sm" onClick={alEditarFicha}>
              {error.faltanProgenitores
                ? 'Añadir los progenitores en la ficha'
                : 'Poner un correo en la ficha'}
            </Boton>
          </div>
        )}

        {textoBoton && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Boton
              icono={enviando ? undefined : hayEnviados ? Send : Mail}
              variante={hayEnviados ? 'secundario' : 'principal'}
              tamano={hayEnviados ? 'sm' : 'md'}
              onClick={enviar}
              disabled={enviando}
            >
              {enviando ? (
                <>
                  <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
                  Enviando…
                </>
              ) : (
                textoBoton
              )}
            </Boton>
            {hayEnviados && !todosFirmados && (
              <p className="text-xs text-tinta-tenue">
                Al reenviarlo, los enlaces anteriores dejan de valer.
              </p>
            )}
          </div>
        )}
      </Card>

      <FirmaModal
        abierto={Boolean(firmaAbierta)}
        alCerrar={() => setFirmaAbierta(null)}
        firmante={firmaAbierta}
        paciente={paciente}
      />
    </>
  )
}
