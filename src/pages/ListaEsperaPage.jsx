import { useMemo, useState } from 'react'
import { ChevronLeft, Clock, HeartHandshake, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import Cabecera from '../components/layout/Cabecera'
import Boton from '../components/ui/Boton'
import Card from '../components/ui/Card'
import Aviso from '../components/ui/Aviso'
import AvisoError from '../components/ui/AvisoError'
import EstadoVacio from '../components/ui/EstadoVacio'
import { EsqueletoLista } from '../components/ui/Cargando'
import EsperaFila from '../features/espera/EsperaFila'
import EsperaModal from '../features/espera/EsperaModal'
import HuecoLiberado from '../features/espera/HuecoLiberado'
import CitaModal from '../features/agenda/CitaModal'
import { useListaEspera } from '../hooks/useListaEspera'
import { cambiarEstadoEspera } from '../services/listaEspera'
import { esperasDe } from '../lib/espera'
import { aClave, hoy } from '../lib/fechas'

/* La lista de espera: quién quiere hueco en una semana que está llena.

   El día que alguien cancela por WhatsApp, esa cita se queda tachada en
   la agenda y el hueco no se lo queda nadie. Aquí ese hueco se cruza
   con quien lo estaba esperando, y darle la cita es un botón. */
export default function ListaEsperaPage() {
  const { esperas, huecos, cargando, error, recargar, aplicarCambio, quitar } =
    useListaEspera()

  const [modalEspera, setModalEspera] = useState(false)
  const [esperaEditando, setEsperaEditando] = useState(null)
  const [aviso, setAviso] = useState(null)

  // La espera a la que se le está dando un hueco concreto
  const [dando, setDando] = useState(null)

  const claveHoy = aClave(hoy())

  /* Sólo los huecos a los que les espera alguien. Un hueco que no le
     sirve a nadie no es noticia: ya se ve tachado en el calendario. */
  const huecosConGente = useMemo(
    () => huecos.filter((h) => esperasDe(h, esperas).length > 0),
    [huecos, esperas],
  )

  const abrirNueva = () => {
    setEsperaEditando(null)
    setModalEspera(true)
  }

  const abrirEdicion = (espera) => {
    setEsperaEditando(espera)
    setModalEspera(true)
  }

  const trasGuardarEspera = (espera) => {
    aplicarCambio(espera)
    setAviso({
      tipo: 'exito',
      titulo: esperaEditando ? 'Espera actualizada' : `${espera.pacienteNombre} está en la lista`,
      detalle: esperaEditando
        ? undefined
        : 'Cuando se cancele una cita que le encaje, aparecerá arriba.',
    })
  }

  /* Dar el hueco a alguien: se abre la cita nueva ya rellena con su
     fecha, su hora y su tipo de sesión. */
  const darCita = (espera, hueco) => {
    setDando({ espera, hueco })
  }

  /* La cita ya está creada. Se marca la espera como resuelta —queda
     apuntada con su cita— y se recarga, porque ese hueco ya no está
     libre para nadie más. */
  const trasCrearCita = async (cita, avisoGoogle) => {
    const { espera } = dando
    setDando(null)

    const { error: fallo } = await cambiarEstadoEspera(espera.id, 'resuelto', cita.id)
    if (fallo) {
      setAviso({
        tipo: 'error',
        titulo: 'La cita se ha creado, pero la espera sigue en la lista',
        detalle: fallo.mensaje,
      })
      recargar()
      return
    }

    quitar(espera.id)
    recargar()
    setAviso({
      tipo: avisoGoogle ? 'error' : 'exito',
      titulo: `${espera.pacienteNombre} ya tiene su cita`,
      detalle: avisoGoogle
        ? `No se ha podido pasar a Google Calendar: ${avisoGoogle.mensaje}`
        : 'Se ha quitado de la lista de espera.',
    })
  }

  const enEspera = esperas.length

  return (
    <>
      <Link
        to="/calendario"
        className="mb-4 -ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
      >
        <ChevronLeft className="size-4" />
        Calendario
      </Link>

      <Cabecera
        titulo="Lista de espera"
        subtitulo={
          cargando
            ? 'Cargando…'
            : enEspera === 0
              ? 'No hay nadie esperando hueco'
              : `${enEspera} ${enEspera === 1 ? 'persona espera' : 'personas esperan'} a que se libere un hueco`
        }
        accion={
          <Boton icono={UserPlus} onClick={abrirNueva}>
            Apuntar a alguien
          </Boton>
        }
      />

      <AvisoError error={error} alReintentar={recargar} className="mb-4" />

      {cargando ? (
        <EsqueletoLista filas={4} />
      ) : (
        <>
          {/* Lo primero, si lo hay: los huecos que ya tienen dueño posible */}
          {huecosConGente.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 flex items-center gap-2 font-semibold text-tinta">
                <HeartHandshake className="size-5 text-verde" strokeWidth={1.9} />
                {huecosConGente.length === 1
                  ? 'Se ha liberado un hueco'
                  : `Se han liberado ${huecosConGente.length} huecos`}
              </h2>
              <p className="mb-3 text-sm text-tinta-suave">
                Estas citas se han cancelado y hay gente en la lista a la que le
                encajan.
              </p>
              <Card className="divide-y divide-borde overflow-hidden border-verde/30">
                {huecosConGente.map((hueco) => (
                  <HuecoLiberado
                    key={hueco.citaId}
                    hueco={hueco}
                    esperas={esperas}
                    alDarCita={darCita}
                  />
                ))}
              </Card>
            </section>
          )}

          {enEspera === 0 ? (
            <EstadoVacio
              icono={Clock}
              titulo="No hay nadie en la lista de espera"
              texto="Cuando alguien pida cita para una semana que ya está llena, apúntalo aquí. Si se cancela una cita que le encaje, te lo diremos."
              accion={
                <Boton icono={UserPlus} onClick={abrirNueva}>
                  Apuntar al primero
                </Boton>
              }
            />
          ) : (
            <section>
              <h2 className="mb-2 font-semibold text-tinta">Quién está esperando</h2>
              <p className="mb-3 text-sm text-tinta-suave">
                Por orden de llegada: primero quien lleva más tiempo esperando.
              </p>
              <Card className="divide-y divide-borde overflow-hidden">
                {esperas.map((espera) => (
                  <EsperaFila
                    key={espera.id}
                    espera={espera}
                    huecos={huecos}
                    claveHoy={claveHoy}
                    alEditar={abrirEdicion}
                    alCambiar={aplicarCambio}
                    alQuitar={(id, nombre) => {
                      quitar(id)
                      setAviso({
                        tipo: 'exito',
                        titulo: `${nombre} ya no está en la lista`,
                      })
                    }}
                    alFallar={(fallo) =>
                      setAviso({ tipo: 'error', titulo: fallo.mensaje })
                    }
                  />
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      <EsperaModal
        abierto={modalEspera}
        alCerrar={() => setModalEspera(false)}
        espera={esperaEditando}
        alGuardar={trasGuardarEspera}
      />

      <CitaModal
        abierto={Boolean(dando)}
        alCerrar={() => setDando(null)}
        pacienteId={dando?.espera.pacienteId}
        fechaSugerida={dando?.hueco.fecha}
        horaSugerida={dando?.hueco.hora}
        tipoSugerido={dando?.espera.tipo}
        alGuardar={trasCrearCita}
      />

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}
