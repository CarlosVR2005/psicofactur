import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  FileSignature,
  Link2Off,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import Marca from '../components/layout/Marca'
import Boton from '../components/ui/Boton'
import Card from '../components/ui/Card'
import Cargando from '../components/ui/Cargando'
import AvisoError from '../components/ui/AvisoError'
import { Campo, Entrada } from '../components/ui/Campo'
import LienzoFirma from '../features/consentimiento/LienzoFirma'
import TextoLegal from '../features/consentimiento/TextoLegal'
import {
  DECLARACION,
  documentoConsentimiento,
  errorDeDocumento,
  nombreDeLaConsulta,
} from '../lib/consentimiento'
import { fechaNumerica } from '../lib/fechas'
import { normalizarNif } from '../lib/nif'
import { firmarConsentimiento, getConsentimiento } from '../services/consentimiento'

/* ================================================================
   PÁGINA PÚBLICA DE FIRMA — /consentimiento?token=…

   La única pantalla de la app a la que se entra SIN sesión. Quien
   llega es un paciente que ha pulsado un botón en su correo, casi
   siempre desde el móvil y probablemente una sola vez en su vida: si
   algo no se entiende, no hay a quién preguntar y el trámite se queda
   sin hacer.

   De ahí las tres decisiones de esta pantalla:

   · Todo en una sola página que se lee de arriba abajo. Nada de pasos,
     ni pestañas, ni «continuar»: en un móvil, un formulario partido en
     pasos es un formulario que se abandona.
   · El botón de firmar está apagado hasta que están las tres cosas
     (nombre y DNI, casilla marcada y trazo), y debajo se dice
     exactamente qué falta. Un botón que no se puede pulsar y no
     explica por qué es una pared.
   · Los finales que no son «firmado» —enlace caducado, ya firmado, no
     existe— tienen su propia pantalla con su explicación, porque son
     lo que más se va a ver después del éxito.
   ================================================================ */

/** Marco común: la cabecera con la consulta y el cuerpo centrado. */
function Pagina({ consulta, children }) {
  return (
    <div className="min-h-dvh bg-crema px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex flex-col items-center text-center">
          <Marca className="size-12" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-tinta">
            {consulta || 'Consulta de psicología'}
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Consentimiento informado y protección de datos
          </p>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Los finales en los que no hay nada que firmar. */
function EnlaceNoValido({ motivo, fechaFirma }) {
  const contenido = {
    firmado: {
      icono: CheckCircle2,
      tono: 'text-verde',
      titulo: 'Este documento ya está firmado',
      texto: fechaFirma
        ? `Se firmó el ${fechaNumerica(new Date(fechaFirma))} y quedó registrado. No hace falta que hagas nada más.`
        : 'Ya quedó registrado, así que no hace falta que hagas nada más.',
    },
    caducado: {
      icono: Link2Off,
      tono: 'text-ambar',
      titulo: 'El enlace ha caducado',
      texto:
        'Por seguridad, estos enlaces dejan de valer al cabo de un tiempo. Responde al correo que recibiste y te mandarán uno nuevo.',
    },
    desconocido: {
      icono: Link2Off,
      tono: 'text-tinta-tenue',
      titulo: 'Este enlace ya no vale',
      texto:
        'Puede que el documento ya se haya firmado, o que se te haya enviado un enlace más reciente. Mira si tienes un correo posterior; si no, responde a ese correo y te mandarán otro.',
    },
  }[motivo] ?? {
    icono: Link2Off,
    tono: 'text-tinta-tenue',
    titulo: 'Este enlace ya no vale',
    texto: 'Responde al correo que recibiste y te mandarán uno nuevo.',
  }

  const Icono = contenido.icono

  return (
    <Card className="p-8 text-center">
      <Icono className={`mx-auto size-10 ${contenido.tono}`} strokeWidth={1.8} />
      <h2 className="mt-4 text-lg font-semibold text-tinta">{contenido.titulo}</h2>
      <p className="mx-auto mt-2 max-w-sm leading-relaxed text-tinta-suave">
        {contenido.texto}
      </p>
    </Card>
  )
}

export default function ConsentimientoPage() {
  const [parametros] = useSearchParams()
  const token = parametros.get('token') ?? ''

  const [estado, setEstado] = useState({ cargando: true, datos: null, error: null })

  // El formulario
  const [nombre, setNombre] = useState('')
  const [dni, setDni] = useState('')
  const [acepto, setAcepto] = useState(false)
  const [firma, setFirma] = useState(null)
  const [tocado, setTocado] = useState(false)
  const [firmando, setFirmando] = useState(false)
  const [errorFirma, setErrorFirma] = useState(null)
  const [firmado, setFirmado] = useState(null)

  const cargar = useCallback(async () => {
    setEstado({ cargando: true, datos: null, error: null })
    const { data, error } = await getConsentimiento(token)
    if (error) {
      setEstado({ cargando: false, datos: null, error })
      return
    }
    setEstado({ cargando: false, datos: data, error: null })
    if (data?.valido) {
      setNombre(data.paciente.nombre ?? '')
      setDni(data.paciente.dni ?? '')
    }
  }, [token])

  useEffect(() => {
    cargar()
  }, [cargar])

  const datos = estado.datos
  const consulta = datos?.valido ? nombreDeLaConsulta(datos.consulta) : ''
  const secciones = useMemo(
    () => (datos?.valido ? documentoConsentimiento(datos.consulta) : []),
    [datos],
  )

  /* Qué falta para poder firmar. Se calcula aquí, en un solo sitio, y
     sirve para dos cosas: apagar el botón y decir qué falta. */
  const errorNombre = nombre.trim().length < 3 ? 'Escribe tu nombre y tus apellidos.' : null
  const errorDni = errorDeDocumento(dni)
  const falta =
    errorNombre ?? errorDni ?? (!acepto ? 'Marca la casilla de aceptación.' : null) ??
    (!firma ? 'Falta tu firma en el recuadro.' : null)

  const enviar = async (e) => {
    e.preventDefault()
    setTocado(true)
    setErrorFirma(null)
    if (falta || firmando) return

    setFirmando(true)
    const { data, error } = await firmarConsentimiento({
      token,
      firmaBase64: firma,
      nombre: nombre.trim(),
      dni: normalizarNif(dni),
      aceptoTerminos: acepto,
    })
    setFirmando(false)

    if (error) {
      setErrorFirma(error)
      return
    }

    /* El enlace dejó de valer mientras leía: caducó, o lo firmó desde
       otra pestaña. No es un error que arregle reintentando, así que se
       le enseña la pantalla que explica qué ha pasado. */
    if (!data.firmado) {
      setEstado((e0) => ({ ...e0, datos: { valido: false, motivo: data.motivo } }))
      return
    }

    setFirmado(data)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ---------- Pantallas que no son el formulario ---------- */

  if (estado.cargando) {
    return (
      <Pagina consulta="">
        <Cargando texto="Abriendo el documento…" />
      </Pagina>
    )
  }

  if (estado.error) {
    return (
      <Pagina consulta="">
        <AvisoError error={estado.error} alReintentar={cargar} />
      </Pagina>
    )
  }

  if (firmado) {
    return (
      <Pagina consulta={consulta}>
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-verde" strokeWidth={1.8} />
          <h2 className="mt-4 text-xl font-semibold text-tinta">Firmado, gracias</h2>
          <p className="mx-auto mt-2 max-w-sm leading-relaxed text-tinta-suave">
            Tu consentimiento ha quedado registrado el{' '}
            {fechaNumerica(new Date(firmado.fechaFirma))}. Ya puedes cerrar esta página.
          </p>
          <p className="mx-auto mt-4 max-w-sm text-sm text-tinta-tenue">
            Si quieres una copia del documento que has firmado, pídesela a{' '}
            {consulta} cuando quieras.
          </p>
        </Card>
      </Pagina>
    )
  }

  if (!datos?.valido) {
    return (
      <Pagina consulta="">
        <EnlaceNoValido motivo={datos?.motivo} fechaFirma={datos?.fechaFirma} />
      </Pagina>
    )
  }

  /* ---------- El documento ---------- */

  return (
    <Pagina consulta={consulta}>
      <Card className="p-5 sm:p-7">
        <div className="flex items-start gap-3 rounded-2xl bg-marca-50 px-4 py-3.5 text-sm leading-relaxed text-marca-700">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <p>
            Lee el documento, comprueba que tus datos están bien y fírmalo con el dedo
            al final. Es el mismo papel que se firmaba en la consulta.
          </p>
        </div>

        <div className="mt-6">
          <TextoLegal secciones={secciones} />
        </div>
      </Card>

      <form onSubmit={enviar} className="mt-4">
        <Card className="p-5 sm:p-7">
          <h2 className="flex items-center gap-2 font-semibold text-tinta">
            <FileSignature className="size-5 text-marca-500" strokeWidth={1.9} />
            Tus datos y tu firma
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Nombre y apellidos"
              ayuda="Como aparecen en tu documento de identidad."
            >
              <Entrada
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="name"
                placeholder="Lucía Fernández Molina"
                aria-invalid={tocado && Boolean(errorNombre)}
              />
            </Campo>

            <Campo etiqueta="DNI o NIE" ayuda="Con la letra al final, sin espacios.">
              <Entrada
                value={dni}
                onChange={(e) => setDni(e.target.value.toUpperCase())}
                onBlur={() => setDni((d) => normalizarNif(d))}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
                maxLength={12}
                placeholder="12345678A"
                aria-invalid={tocado && Boolean(errorDni)}
              />
            </Campo>
          </div>

          {tocado && (errorNombre || errorDni) && (
            <p className="mt-2 text-sm text-rojo">{errorNombre ?? errorDni}</p>
          )}

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-borde bg-crema/60 px-4 py-3.5">
            <input
              type="checkbox"
              checked={acepto}
              onChange={(e) => setAcepto(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[#4f7c74]"
            />
            <span className="text-sm leading-relaxed text-tinta">{DECLARACION}</span>
          </label>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-tinta-suave">Firma</p>
            <LienzoFirma alCambiar={setFirma} deshabilitado={firmando} />
          </div>

          <AvisoError error={errorFirma} className="mt-5" />

          <Boton
            type="submit"
            tamano="lg"
            className="mt-5 w-full"
            disabled={firmando || Boolean(falta)}
          >
            {firmando ? (
              <>
                <Loader2 className="size-5 animate-spin" strokeWidth={2.2} />
                Registrando la firma…
              </>
            ) : (
              'Firmar y enviar documento'
            )}
          </Boton>

          {/* Qué falta, dicho en claro: el botón apagado por sí solo no
              explica nada, y aquí no hay a quién preguntar. */}
          {falta && !firmando && (
            <p className="mt-2 text-center text-sm text-tinta-tenue">{falta}</p>
          )}

          <p className="mt-4 text-center text-xs leading-relaxed text-tinta-tenue">
            Al firmar se guarda la fecha, la hora y la dirección IP desde la que lo
            haces, únicamente para acreditar la validez del documento.
          </p>
        </Card>
      </form>
    </Pagina>
  )
}
