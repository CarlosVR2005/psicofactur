import { useState } from 'react'
import { BellRing, Pencil, Trash2 } from 'lucide-react'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Boton from '../../components/ui/Boton'
import TipoCitaBadge from '../agenda/TipoCitaBadge'
import { FRANJAS, estaCaducada, huecosDe } from '../../lib/espera'
import { cambiarEstadoEspera, quitarDeEspera } from '../../services/listaEspera'
import { deClave, fechaCorta, haceRato } from '../../lib/fechas'

/* Una persona en la cola.

   Lo que más se mira de una fila no es quién es, sino si le ha salido
   algo: por eso «le encajan N huecos» va destacado y el resto (ventana,
   franja, nota) en gris. */
export default function EsperaFila({
  espera,
  huecos,
  claveHoy,
  alEditar,
  alCambiar,
  alQuitar,
  alFallar,
}) {
  const [ocupado, setOcupado] = useState(false)
  const encajan = huecosDe(espera, huecos)
  const caducada = estaCaducada(espera, claveHoy)
  const avisado = espera.estado === 'avisado'

  const marcarAvisado = async () => {
    setOcupado(true)
    const { data, error } = await cambiarEstadoEspera(
      espera.id,
      avisado ? 'esperando' : 'avisado',
    )
    setOcupado(false)
    if (error) return alFallar(error)
    alCambiar(data)
  }

  const quitar = async () => {
    setOcupado(true)
    const { error } = await quitarDeEspera(espera.id)
    setOcupado(false)
    if (error) return alFallar(error)
    alQuitar(espera.id, espera.pacienteNombre)
  }

  return (
    <div className={`flex flex-wrap items-start gap-3 p-4 ${caducada ? 'opacity-60' : ''}`}>
      <Avatar nombre={espera.pacienteNombre} tamano="md" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-tinta">{espera.pacienteNombre}</p>
          <TipoCitaBadge tipo={espera.tipo} />
          {avisado && (
            <Badge tono="ambar" tamano="sm" punto vivo>
              Avisado, sin respuesta
            </Badge>
          )}
          {caducada && (
            <Badge tono="rojo" tamano="sm">
              Ya pasó la fecha
            </Badge>
          )}
        </div>

        <p className="mt-0.5 text-sm text-tinta-suave">
          Del {fechaCorta(deClave(espera.desde))} al {fechaCorta(deClave(espera.hasta))} ·{' '}
          {FRANJAS[espera.franja].corta} · en la lista desde{' '}
          {haceRato(espera.creadaEn)}
        </p>

        {espera.nota && (
          <p className="mt-1 text-sm italic text-tinta-tenue">«{espera.nota}»</p>
        )}

        {encajan.length > 0 && !caducada && (
          <p className="mt-1.5 text-sm font-medium text-verde">
            {encajan.length === 1
              ? 'Le encaja 1 hueco que se ha liberado'
              : `Le encajan ${encajan.length} huecos que se han liberado`}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Boton
          variante={avisado ? 'suave' : 'fantasma'}
          tamano="sm"
          icono={BellRing}
          onClick={marcarAvisado}
          disabled={ocupado}
          title={
            avisado
              ? 'Volver a ponerlo como pendiente de avisar'
              : 'Ya le he escrito, espero respuesta'
          }
        >
          <span className="sr-only sm:not-sr-only">
            {avisado ? 'Sin respuesta' : 'Avisado'}
          </span>
        </Boton>
        <Boton
          variante="fantasma"
          tamano="sm"
          icono={Pencil}
          onClick={() => alEditar(espera)}
          disabled={ocupado}
          title="Editar la espera"
        >
          <span className="sr-only">Editar</span>
        </Boton>
        <Boton
          variante="fantasma"
          tamano="sm"
          icono={Trash2}
          onClick={quitar}
          disabled={ocupado}
          title="Quitar de la lista"
          className="text-rojo hover:bg-rojo-suave hover:text-rojo"
        >
          <span className="sr-only">Quitar</span>
        </Boton>
      </div>
    </div>
  )
}
