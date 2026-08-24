import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, PhoneOff, RefreshCw, Send, X } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import EstadoConfirmacionBadge from './EstadoConfirmacionBadge'
import TipoCitaBadge from '../agenda/TipoCitaBadge'
import {
  enlaceWhatsApp,
  enviarPorWhatsApp,
  marcarRespuesta,
  registrarEnvio,
} from '../../services/recordatorios'
import { etiquetaDia, haceRato } from '../../lib/fechas'
import { telefono } from '../../lib/formato'
import { BOTON_WHATSAPP, ESTADOS_ENVIO } from '../../lib/tipos'

/* Una próxima cita con su estado de confirmación.

   El estado NO se toca a mano: lo cambia el paciente desde WhatsApp.
   Desde aquí sólo se manda el recordatorio, de una de dos formas según
   los Ajustes: por la API de WhatsApp Business, o abriendo WhatsApp con
   el mensaje escrito para mandarlo a mano. */
export default function RecordatorioCard({
  cita,
  apiActiva = false,
  alEnviar,
  alResponder,
  alFallar,
}) {
  const [enviando, setEnviando] = useState(false)
  const [marcando, setMarcando] = useState(null)

  const nombre = cita.acompananteNombre
    ? `${cita.pacienteNombre} y ${cita.acompananteNombre}`
    : cita.pacienteNombre

  const sinTelefono = !cita.pacienteTelefono

  const enviar = async () => {
    if (sinTelefono) return

    /* Con la API activa lo manda el servidor. Sin ella, se abre WhatsApp
       con el mensaje escrito: OJO, ese `window.open` tiene que ir antes
       de cualquier `await`, o el navegador lo toma por una ventana
       emergente no pedida y la bloquea. */
    if (!apiActiva) {
      window.open(enlaceWhatsApp(cita), '_blank', 'noopener,noreferrer')
    }

    setEnviando(true)
    const { data, error } = apiActiva
      ? await enviarPorWhatsApp(cita)
      : await registrarEnvio(cita)
    setEnviando(false)

    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }
    alEnviar?.(cita.id, data)
  }

  /* Anotar a mano lo que el paciente ha contestado por WhatsApp.
     Escribe `boton_pulsado`, igual que hará el webhook: es el trigger
     de la base quien cambia el estado de la cita. */
  const marcar = async (boton) => {
    setMarcando(boton)
    const { data, error } = await marcarRespuesta(cita, boton)
    setMarcando(null)
    if (error) {
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }
    alResponder?.(cita.id, data)
  }

  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-crema/50 sm:px-5">
      <Avatar nombre={nombre} tamano="md" />

      <div className="min-w-0 flex-1">
        <Link
          to={`/pacientes/${cita.pacienteId}`}
          className="truncate font-medium text-tinta hover:text-marca-600 hover:underline"
        >
          {nombre}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-tinta-suave">
          <span className="font-medium text-tinta first-letter:uppercase">
            {etiquetaDia(cita.fecha)}
          </span>
          <span>a las {cita.hora}</span>
          <TipoCitaBadge tipo={cita.tipo} />
        </p>
      </div>

      <div className="flex flex-col items-start gap-1 sm:items-end">
        <EstadoConfirmacionBadge estado={cita.confirmacion} enviado={cita.enviado} />
        <p className="text-xs text-tinta-tenue">
          {sinTelefono ? (
            <span className="flex items-center gap-1 text-rojo">
              <PhoneOff className="size-3.5" />
              Sin teléfono en la ficha
            </span>
          ) : cita.enviado ? (
            <>
              {ESTADOS_ENVIO[cita.estadoEnvio] ?? 'Enviado'} {haceRato(cita.enviadoAt)}
              {/* Salió solo: que se vea, para que no parezca que se le olvidó mandarlo */}
              {cita.origen === 'automatico' && ' · automático'}
              {cita.envios > 1 && ` · ${cita.envios} envíos`}
            </>
          ) : (
            telefono(cita.pacienteTelefono)
          )}
        </p>
      </div>

      {/* Anotar la respuesta que ha dado el paciente por WhatsApp.
          Desaparecerá cuando el webhook lo haga solo. */}
      <div className="flex shrink-0 items-center gap-1 rounded-xl border border-borde bg-white p-1">
        <BotonRespuesta
          icono={Check}
          activo={cita.confirmacion === 'confirmada'}
          cargando={marcando === BOTON_WHATSAPP.confirmar}
          onClick={() => marcar(BOTON_WHATSAPP.confirmar)}
          titulo="Anotar que ha confirmado"
          tonoActivo="bg-verde-suave text-verde"
          tonoHover="hover:bg-verde-suave hover:text-verde"
        />
        <BotonRespuesta
          icono={X}
          activo={cita.confirmacion === 'cancelada'}
          cargando={marcando === BOTON_WHATSAPP.cancelar}
          onClick={() => marcar(BOTON_WHATSAPP.cancelar)}
          titulo="Anotar que ha cancelado"
          tonoActivo="bg-rojo-suave text-rojo"
          tonoHover="hover:bg-rojo-suave hover:text-rojo"
        />
      </div>

      <button
        onClick={enviar}
        disabled={enviando || sinTelefono}
        title={
          sinTelefono
            ? 'Este paciente no tiene teléfono guardado'
            : cita.enviado
              ? 'Volver a enviar el recordatorio'
              : apiActiva
                ? 'Mandar el recordatorio por WhatsApp'
                : 'Abrir WhatsApp con el recordatorio escrito'
        }
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-borde bg-white px-3 py-2.5 text-sm font-medium text-tinta-suave transition-colors hover:border-marca-200 hover:bg-marca-50 hover:text-marca-700 disabled:opacity-40"
      >
        {enviando ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
        ) : cita.enviado ? (
          <RefreshCw className="size-4" strokeWidth={2} />
        ) : (
          <Send className="size-4" strokeWidth={2} />
        )}
        <span className="hidden sm:inline">
          {cita.enviado ? 'Reenviar' : 'Enviar'}
        </span>
      </button>
    </article>
  )
}

function BotonRespuesta({
  icono: Icono,
  activo,
  cargando,
  onClick,
  titulo,
  tonoActivo,
  tonoHover,
}) {
  return (
    <button
      onClick={onClick}
      disabled={cargando}
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
        activo ? tonoActivo : `text-tinta-tenue ${tonoHover}`
      }`}
    >
      {cargando ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
      ) : (
        <Icono className="size-4" strokeWidth={2.4} />
      )}
    </button>
  )
}
