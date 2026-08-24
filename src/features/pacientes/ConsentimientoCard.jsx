import { useState } from 'react'
import { Eye, Loader2, Mail, Send } from 'lucide-react'
import Card from '../../components/ui/Card'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import ConsentimientoBadge from './ConsentimientoBadge'
import FirmaModal from './FirmaModal'
import { enviarConsentimiento } from '../../services/consentimiento'
import { fechaNumerica } from '../../lib/fechas'

/* ================================================================
   CONSENTIMIENTO INFORMADO — el bloque de la ficha del paciente

   Tres estados y tres cosas distintas que hacer:

     NO_ENVIADO → botón para mandárselo
     PENDIENTE  → «esperando respuesta», con reenviar en discreto
     FIRMADO    → cuándo firmó y un enlace para ver la firma

   El reenvío es a propósito el botón menos visible de los tres. Cada
   reenvío invalida el enlace anterior, así que si ella lo pulsa
   mientras el paciente está leyendo el correo viejo, le rompe el que
   tenía. Es útil —los correos se pierden—, pero no es lo que se hace
   por defecto.
   ================================================================ */
export default function ConsentimientoCard({ paciente, alCambiar, alEditarFicha }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [enviadoAhora, setEnviadoAhora] = useState(null)
  const [viendoFirma, setViendoFirma] = useState(false)

  const estado = paciente.consentimientoEstado ?? 'NO_ENVIADO'
  const firmado = estado === 'FIRMADO'
  const pendiente = estado === 'PENDIENTE'

  const enviar = async () => {
    if (enviando) return
    setError(null)
    setEnviando(true)
    const { data, error: fallo } = await enviarConsentimiento(paciente.id)
    setEnviando(false)

    if (fallo) {
      setError(fallo)
      return
    }

    setEnviadoAhora(data.destinatario)
    // La ficha se entera al momento, sin volver a consultar
    alCambiar?.({
      ...paciente,
      consentimientoEstado: data.estado,
      consentimientoFechaEnvio: data.fechaEnvio,
    })
  }

  return (
    <>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-tinta">Consentimiento informado</h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              {firmado
                ? paciente.consentimientoFechaFirma
                  ? `Firmado el ${fechaNumerica(new Date(paciente.consentimientoFechaFirma))}.`
                  : 'Firmado y registrado.'
                : pendiente
                  ? paciente.consentimientoFechaEnvio
                    ? `Enviado el ${fechaNumerica(new Date(paciente.consentimientoFechaEnvio))}. Todavía no lo ha firmado.`
                    : 'Enviado. Todavía no lo ha firmado.'
                  : 'Todavía no se le ha pedido. Se le manda por correo y lo firma desde el móvil.'}
            </p>
          </div>
          <ConsentimientoBadge estado={estado} />
        </div>

        {enviadoAhora && !firmado && (
          <p className="mt-3 rounded-xl bg-verde-suave px-3.5 py-2.5 text-sm text-verde">
            Enviado a {enviadoAhora}. Le llegará un enlace para firmarlo.
          </p>
        )}

        <AvisoError error={error} className="mt-3" />

        {/* El paciente no tiene correo (o lo tiene mal): el aviso solo no
            arregla nada, así que se ofrece ir a corregirlo. */}
        {error?.sinEmail && alEditarFicha && (
          <div className="mt-3">
            <Boton variante="secundario" tamano="sm" onClick={alEditarFicha}>
              Poner un correo en la ficha
            </Boton>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {firmado ? (
            <Boton variante="secundario" icono={Eye} onClick={() => setViendoFirma(true)}>
              Ver la firma
            </Boton>
          ) : (
            <>
              <Boton
                icono={enviando ? undefined : pendiente ? Send : Mail}
                variante={pendiente ? 'secundario' : 'principal'}
                tamano={pendiente ? 'sm' : 'md'}
                onClick={enviar}
                disabled={enviando}
              >
                {enviando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
                    Enviando…
                  </>
                ) : pendiente ? (
                  'Volver a enviarlo'
                ) : (
                  'Enviar consentimiento'
                )}
              </Boton>

              {pendiente && (
                <p className="text-xs text-tinta-tenue">
                  Al reenviarlo, el enlace anterior deja de valer.
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <FirmaModal
        abierto={viendoFirma}
        alCerrar={() => setViendoFirma(false)}
        paciente={paciente}
      />
    </>
  )
}
