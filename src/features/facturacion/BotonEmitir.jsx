import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, RotateCcw, ShieldAlert, ShieldCheck, Upload } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { emitirFactura } from '../../services/verifacti'

/* ================================================================
   Botón «Emitir»: registra la factura en Hacienda (Veri*Factu).

   Tiene cinco caras, y distinguirlas no es cosmética: son situaciones
   con consecuencias legales distintas.

     · sin enviar   → botón «Emitir». La factura existe aquí, Hacienda
                      no sabe nada de ella.
     · 'error'      → ni se llegó a enviar (datos mal, red caída). El
                      número sigue reservado, así que se reintenta sobre
                      la misma factura.
     · 'Pendiente'  → enviada y encolada. La AEAT no admite envíos en
                      tiempo real y tarda alrededor de un minuto.
     · 'Correcto'   → aceptada por Hacienda. Esto es lo único que
                      significa «presentada».
     · 'Incorrecto' → Hacienda la RECHAZÓ. Es el caso traicionero: el
                      envío dijo que sí y el rechazo llegó después. Se
                      pinta en rojo y con el motivo, porque una factura
                      rechazada que parezca correcta es justo lo que no
                      puede pasar.
   ================================================================ */
export default function BotonEmitir({ factura, alEmitir, alFallar }) {
  const [trabajando, setTrabajando] = useState(false)
  const navegar = useNavigate()

  const emitir = async () => {
    if (trabajando) return
    setTrabajando(true)
    const { data, error } = await emitirFactura({ facturaId: factura.id })
    setTrabajando(false)

    if (error) {
      /* Le faltan los datos fiscales: no sirve de nada reintentar, así
         que se la lleva a rellenarlos en vez de dejarla atascada. */
      if (error.configuracionIncompleta) {
        alFallar?.({ tipo: 'error', titulo: error.mensaje })
        navegar('/ajustes')
        return
      }
      alFallar?.({ tipo: 'error', titulo: error.mensaje })
      return
    }

    let titulo
    if (data.yaEmitida) titulo = `La factura ${data.numero} ya estaba registrada`
    else if (data.subsanada) titulo = `Factura ${data.numero} corregida y reenviada`
    else titulo = `Factura ${data.numero} enviada a Hacienda`

    alEmitir?.({
      tipo: 'exito',
      titulo,
      detalle: 'Hacienda tarda alrededor de un minuto en confirmarla.',
      factura: data,
    })
  }

  const estado = factura.verifactuEstado

  /* Hacienda rechazó el registro. Como lo rechazó, para la AEAT esa
     factura no llegó a existir: se reenvía con el MISMO número y los
     datos ya corregidos. Eso es subsanar, y no gasta número nuevo.

     El botón enseña el motivo que dio Hacienda al pasar por encima,
     porque subsanar sin haber corregido antes la ficha del paciente
     sólo sirve para que la rechacen otra vez. */
  if (estado === 'Incorrecto') {
    return (
      <button
        type="button"
        onClick={emitir}
        disabled={trabajando}
        title={
          factura.verifactuError
            ? `Hacienda la rechazó: ${factura.verifactuError}\n\nCorrige el dato en la ficha del paciente y pulsa para reenviarla.`
            : 'Hacienda la rechazó. Corrige el dato y pulsa para reenviarla.'
        }
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rojo-suave px-3 py-1.5 text-sm font-medium text-rojo transition-colors hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
      >
        {trabajando ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
        ) : (
          <ShieldAlert className="size-4" strokeWidth={2} />
        )}
        Subsanar
      </button>
    )
  }

  // Duplicado: el registro ya existía. Subsanar no es el remedio, así
  // que aquí no se ofrece nada que pueda empeorarlo.
  if (estado === 'Duplicado') {
    return (
      <Badge tono="rojo" tamano="sm" icono={ShieldAlert}>
        <span title={factura.verifactuError || 'Hacienda ya tenía un registro igual'}>
          Duplicada
        </span>
      </Badge>
    )
  }

  // Ni se llegó a enviar: el número sigue reservado, se reintenta
  if (estado === 'error') {
    return (
      <button
        type="button"
        onClick={emitir}
        disabled={trabajando}
        title={factura.verifactuError || 'El envío anterior falló. Vuelve a intentarlo.'}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rojo-suave px-3 py-1.5 text-sm font-medium text-rojo transition-colors hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
      >
        {trabajando ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
        ) : (
          <RotateCcw className="size-4" strokeWidth={2} />
        )}
        Reintentar
      </button>
    )
  }

  if (factura.emitida) {
    const aceptada = estado === 'Correcto'
    return (
      <Badge
        tono={aceptada ? 'verde' : 'azul'}
        tamano="sm"
        punto={!aceptada}
        vivo={!aceptada}
        icono={aceptada ? ShieldCheck : undefined}
      >
        <span title={aceptada ? 'Aceptada por Hacienda' : 'Hacienda todavía no la ha confirmado'}>
          {aceptada ? 'En Hacienda' : 'Enviando…'}
        </span>
      </Badge>
    )
  }

  return (
    <button
      type="button"
      onClick={emitir}
      disabled={trabajando}
      title="Registrar la factura en Hacienda (Veri*Factu)"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-marca-50 px-3 py-1.5 text-sm font-medium text-marca-700 transition-colors hover:bg-marca-100 active:scale-[0.98] disabled:opacity-50"
    >
      {trabajando ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
      ) : (
        <Upload className="size-4" strokeWidth={2} />
      )}
      Emitir
    </button>
  )
}
