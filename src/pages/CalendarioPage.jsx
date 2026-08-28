import { useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  Clock,
  HeartHandshake,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Cabecera from '../components/layout/Cabecera'
import Boton from '../components/ui/Boton'
import Card from '../components/ui/Card'
import Segmentado from '../components/ui/Segmentado'
import AvisoError from '../components/ui/AvisoError'
import Cargando from '../components/ui/Cargando'
import Aviso from '../components/ui/Aviso'
import VistaSemana from '../features/agenda/VistaSemana'
import VistaMes from '../features/agenda/VistaMes'
import ListaDelDia from '../features/agenda/ListaDelDia'
import CitaModal from '../features/agenda/CitaModal'
import { LeyendaConfirmacion, LeyendaTipos } from '../features/agenda/TipoCitaBadge'
import { useCitas } from '../hooks/useCitas'
import { useListaEspera } from '../hooks/useListaEspera'
import { contarEventosPendientes } from '../services/eventosPendientes'
import { esperasDe } from '../lib/espera'
import {
  aClave,
  diasDeSemana,
  etiquetaDia,
  fechaCorta,
  hoy,
  mesYAno,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from '../lib/fechas'

const VISTAS = [
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' },
]

export default function CalendarioPage() {
  const [vista, setVista] = useState('semana')
  const [referencia, setReferencia] = useState(hoy()) // día "ancla" de la vista
  const [diaElegido, setDiaElegido] = useState(aClave(hoy()))

  // Modal de cita
  const [citaEditando, setCitaEditando] = useState(null)
  const [fechaSugerida, setFechaSugerida] = useState(null)
  const [horaSugerida, setHoraSugerida] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [aviso, setAviso] = useState(null)

  /* Eventos de Google que no sabemos de quién son. Se cuentan al entrar:
     si no se avisa aquí, esa bandeja no la encuentra nadie. */
  const [porRevisar, setPorRevisar] = useState(0)
  useEffect(() => {
    let vivo = true
    contarEventosPendientes().then(({ data }) => {
      if (vivo) setPorRevisar(data ?? 0)
    })
    return () => {
      vivo = false
    }
  }, [])

  /* La cita ya está guardada en Supabase; `aviso` sólo llega si Google
     Calendar no aceptó el cambio, y entonces se avisa sin alarmar. */
  const trasGuardar = (_datos, avisoGoogle) => {
    recargar({ silencioso: true })
    if (avisoGoogle) {
      setAviso({
        tipo: 'error',
        titulo: 'La cita se ha guardado, pero no se ha podido pasar a Google Calendar',
        detalle: avisoGoogle.mensaje,
      })
    }
  }

  const dias = useMemo(() => diasDeSemana(referencia), [referencia])

  // Se pide a la base sólo lo que se está mirando
  const { desde, hasta } = useMemo(() => {
    if (vista === 'semana') {
      return { desde: aClave(dias[0]), hasta: aClave(dias[6]) }
    }
    const cuadricula = semanasDelMes(referencia).flat()
    return {
      desde: aClave(cuadricula[0]),
      hasta: aClave(cuadricula[cuadricula.length - 1]),
    }
  }, [vista, dias, referencia])

  const { citasPorDia, cargando, error, recargar } = useCitas(desde, hasta)

  /* La lista de espera. Aquí sólo interesa una cosa: si una cancelación
     ha dejado un hueco que alguien estaba esperando. */
  const { esperas, huecos } = useListaEspera()
  const huecosConGente = useMemo(
    () => huecos.filter((h) => esperasDe(h, esperas).length > 0),
    [huecos, esperas],
  )

  const retroceder = () =>
    setReferencia((r) => (vista === 'semana' ? sumarDias(r, -7) : sumarMeses(r, -1)))
  const avanzar = () =>
    setReferencia((r) => (vista === 'semana' ? sumarDias(r, 7) : sumarMeses(r, 1)))
  const irAHoy = () => {
    setReferencia(hoy())
    setDiaElegido(aClave(hoy()))
  }

  /* `hora` llega cuando se pulsa un hueco libre del calendario: la cita
     nueva se propone justo a esa hora, que es a lo que se está mirando. */
  const abrirNueva = (clave, hora = null) => {
    setCitaEditando(null)
    setFechaSugerida(clave ?? diaElegido)
    setHoraSugerida(hora)
    setModalAbierto(true)
  }

  const abrirCita = (cita) => {
    setCitaEditando(cita)
    setFechaSugerida(null)
    setHoraSugerida(null)
    setModalAbierto(true)
  }

  const titulo =
    vista === 'semana'
      ? dias[0].getMonth() === dias[6].getMonth()
        ? mesYAno(dias[0])
        : `${fechaCorta(dias[0])} – ${fechaCorta(dias[6])}`
      : mesYAno(referencia)

  // Las canceladas se quedan a la vista (tachadas) para poder reprogramarlas
  const citasDelDiaElegido = citasPorDia.get(diaElegido) ?? []

  return (
    <>
      <Cabecera
        titulo="Calendario"
        subtitulo="Tu agenda de la consulta"
        accion={
          <Boton icono={CalendarPlus} onClick={() => abrirNueva()}>
            Nueva cita
          </Boton>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={retroceder}
              aria-label="Anterior"
              className="rounded-xl border border-borde bg-white p-2.5 text-tinta-suave transition-colors hover:bg-crema hover:text-tinta"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={avanzar}
              aria-label="Siguiente"
              className="rounded-xl border border-borde bg-white p-2.5 text-tinta-suave transition-colors hover:bg-crema hover:text-tinta"
            >
              <ChevronRight className="size-5" />
            </button>
            <p className="ml-2 text-lg font-semibold text-tinta first-letter:uppercase">
              {titulo}
            </p>
            <Boton variante="fantasma" tamano="sm" className="ml-1" onClick={irAHoy}>
              Hoy
            </Boton>
          </div>

          <Segmentado opciones={VISTAS} valor={vista} alCambiar={setVista} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {vista === 'semana' ? <LeyendaTipos conCancelada /> : <LeyendaConfirmacion />}
          <Link
            to="/espera"
            className="flex items-center gap-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-marca-600"
          >
            <Clock className="size-4" strokeWidth={1.9} />
            Lista de espera
            {esperas.length > 0 && (
              <span className="rounded-full bg-crema px-1.5 text-xs font-semibold text-tinta-suave">
                {esperas.length}
              </span>
            )}
          </Link>
        </div>
      </Cabecera>

      {porRevisar > 0 && (
        <Link
          to="/revisar"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-marca-200 bg-marca-50/70 px-4 py-3 transition-colors hover:bg-marca-50"
        >
          <CalendarSearch className="size-5 shrink-0 text-marca-600" strokeWidth={1.9} />
          <p className="min-w-0 flex-1 text-sm text-marca-800">
            {porRevisar === 1
              ? 'Hay 1 evento de tu Google Calendar sin asignar a ningún paciente.'
              : `Hay ${porRevisar} eventos de tu Google Calendar sin asignar a ningún paciente.`}
          </p>
          <span className="shrink-0 text-sm font-medium text-marca-700 underline">
            Revisarlos
          </span>
        </Link>
      )}

      {/* Hay un hueco libre (por cancelación o dentro del horario) que le
          encaja a alguien de la lista de espera. Es el aviso que hace que
          la lista sirva de algo: si no se ve aquí, no se entera nadie. */}
      {huecosConGente.length > 0 && (
        <Link
          to="/espera"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-verde/30 bg-verde-suave/60 px-4 py-3 transition-colors hover:bg-verde-suave"
        >
          <HeartHandshake className="size-5 shrink-0 text-verde" strokeWidth={1.9} />
          <p className="min-w-0 flex-1 text-sm text-tinta">
            {huecosConGente.length === 1
              ? 'Hay un hueco libre y alguien esperándolo.'
              : `Hay ${huecosConGente.length} huecos libres y gente esperándolos.`}
          </p>
          <span className="shrink-0 text-sm font-medium text-verde underline">
            Ver quién lo quiere
          </span>
        </Link>
      )}

      <AvisoError error={error} alReintentar={recargar} className="mb-4" />

      {cargando ? (
        <Cargando texto="Cargando la agenda…" />
      ) : vista === 'semana' ? (
        <VistaSemana
          dias={dias}
          citasPorDia={citasPorDia}
          alPulsarCita={abrirCita}
          alAnadirEnDia={(clave, hora) => abrirNueva(clave, hora)}
        />
      ) : (
        <>
          <VistaMes
            mes={referencia}
            citasPorDia={citasPorDia}
            diaElegido={diaElegido}
            alElegirDia={setDiaElegido}
          />

          {/* Detalle del día seleccionado */}
          <Card className="mt-4 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-tinta first-letter:uppercase">
                {etiquetaDia(diaElegido)}
              </h2>
              <Boton
                variante="suave"
                tamano="sm"
                icono={CalendarPlus}
                onClick={() => abrirNueva(diaElegido)}
              >
                Añadir
              </Boton>
            </div>

            {citasDelDiaElegido.length === 0 ? (
              <p className="py-4 text-center text-sm text-tinta-suave">
                No hay ninguna cita este día.
              </p>
            ) : (
              <ListaDelDia
                citas={citasDelDiaElegido}
                alPulsarCita={abrirCita}
                alAnadirAlHueco={(hora) => abrirNueva(diaElegido, hora)}
              />
            )}
          </Card>
        </>
      )}

      <CitaModal
        abierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        cita={citaEditando}
        fechaSugerida={fechaSugerida}
        horaSugerida={horaSugerida}
        alGuardar={trasGuardar}
        alEliminar={trasGuardar}
      />

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}
