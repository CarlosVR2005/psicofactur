import { useEffect, useState } from 'react'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { Campo, Entrada, AreaTexto } from '../../components/ui/Campo'
import {
  actualizarEntrada,
  crearEntrada,
  eliminarAdjunto,
  subirAdjunto,
} from '../../services/historia'
import { aClave, hoy } from '../../lib/fechas'
import { tamanoArchivo } from '../../lib/formato'

/* ================================================================
   ALTA Y EDICIÓN de una entrada de la historia clínica

   Se guarda en dos tiempos: primero la entrada (fecha, título, texto) y
   después los documentos, uno a uno. Si un documento falla, se dice
   cuál y NO se pierde lo escrito —la entrada ya está guardada—, igual
   que hace la importación de pacientes en lote.

   Los documentos existentes se pueden marcar para borrar; se quitan al
   guardar, no antes, para poder echarse atrás cerrando el modal.
   ================================================================ */

// Debe cuadrar con `allowed_mime_types` del bucket `historia` (migración 0027)
const ACEPTA =
  '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.doc,.docx,.odt,.txt,' +
  'application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp,' +
  'application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.oasis.opendocument.text,text/plain'

const TAMANO_MAX = 15 * 1024 * 1024 // 15 MB, como el bucket

const EXT_OK = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'doc', 'docx', 'odt', 'txt']

function archivoAdmitido(archivo) {
  const ext = archivo.name.split('.').pop()?.toLowerCase() ?? ''
  if (!EXT_OK.includes(ext)) {
    return `«${archivo.name}» no es un tipo admitido (PDF, imagen, Word o texto).`
  }
  if (archivo.size > TAMANO_MAX) {
    return `«${archivo.name}» pesa más de 15 MB.`
  }
  return null
}

export default function EntradaHistoriaModal({
  abierto,
  alCerrar,
  paciente,
  entrada,
  alGuardar,
}) {
  const [fecha, setFecha] = useState('')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [nuevos, setNuevos] = useState([]) // File[] pendientes de subir
  const [aBorrar, setABorrar] = useState([]) // ids de adjuntos existentes a quitar
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [fallos, setFallos] = useState([]) // nombres de documentos que no subieron

  const esNueva = !entrada

  useEffect(() => {
    if (!abierto) return
    setFecha(entrada?.fecha || aClave(hoy()))
    setTitulo(entrada?.titulo || '')
    setTexto(entrada?.texto || '')
    setNuevos([])
    setABorrar([])
    setError(null)
    setFallos([])
    setGuardando(false)
  }, [abierto, entrada])

  const adjuntosExistentes = entrada?.adjuntos ?? []
  const puedeGuardar = titulo.trim() !== '' && fecha !== '' && !guardando

  const anadirArchivos = (lista) => {
    const problemas = []
    const validos = []
    for (const archivo of lista) {
      const problema = archivoAdmitido(archivo)
      if (problema) problemas.push(problema)
      else validos.push(archivo)
    }
    setError(problemas.length ? { mensaje: problemas.join(' ') } : null)
    if (validos.length) setNuevos((prev) => [...prev, ...validos])
  }

  const guardar = async () => {
    if (!puedeGuardar) return
    setError(null)
    setFallos([])
    setGuardando(true)

    const datos = {
      fecha,
      titulo,
      texto,
      citaId: entrada?.citaId ?? null,
    }

    const { data: entradaGuardada, error: fallo } = esNueva
      ? await crearEntrada(paciente.id, datos)
      : await actualizarEntrada(entrada.id, datos)

    if (fallo) {
      setError(fallo)
      setGuardando(false)
      return
    }

    // Documentos existentes marcados para borrar
    let adjuntosFinales = adjuntosExistentes.filter((a) => !aBorrar.includes(a.id))
    for (const id of aBorrar) {
      const adjunto = adjuntosExistentes.find((a) => a.id === id)
      if (adjunto) await eliminarAdjunto(adjunto)
    }

    // Documentos nuevos, uno a uno
    const noSubieron = []
    for (const archivo of nuevos) {
      const { data: adjunto, error: falloSubida } = await subirAdjunto(
        entradaGuardada,
        archivo,
      )
      if (falloSubida) noSubieron.push(archivo.name)
      else adjuntosFinales.push(adjunto)
    }

    adjuntosFinales = adjuntosFinales.sort((a, b) =>
      String(a.creadoEn).localeCompare(String(b.creadoEn)),
    )
    alGuardar({ ...entradaGuardada, adjuntos: adjuntosFinales })

    setGuardando(false)

    if (noSubieron.length) {
      // La entrada se guardó; sólo fallaron estos documentos. Se dejan
      // pendientes para volver a intentarlo sin reescribir nada.
      setFallos(noSubieron)
      setNuevos((prev) => prev.filter((f) => noSubieron.includes(f.name)))
      setError({
        mensaje:
          noSubieron.length === 1
            ? 'La entrada se ha guardado, pero un documento no se ha podido subir. Vuelve a intentarlo.'
            : `La entrada se ha guardado, pero ${noSubieron.length} documentos no se han podido subir. Vuelve a intentarlo.`,
      })
      return
    }

    alCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={guardando ? () => {} : alCerrar}
      titulo={esNueva ? 'Nueva entrada' : 'Editar entrada'}
      descripcion={paciente?.nombre}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={!puedeGuardar}>
            {guardando ? (
              <>
                <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
                Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <AvisoError error={error} />

        <Campo etiqueta="Fecha">
          <Entrada
            type="date"
            value={fecha}
            max={aClave(hoy())}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Campo>

        <Campo etiqueta="Título" ayuda="Primera consulta, Sesión 12, Informe del colegio…">
          <Entrada
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Primera consulta"
            autoFocus
          />
        </Campo>

        <Campo etiqueta="Texto" ayuda="Opcional si la entrada es sólo un documento.">
          <AreaTexto
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </Campo>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-tinta-suave">
            Documentos
          </span>

          {adjuntosExistentes.length > 0 && (
            <ul className="mb-2 divide-y divide-borde rounded-xl border border-borde">
              {adjuntosExistentes.map((adjunto) => {
                const marcado = aBorrar.includes(adjunto.id)
                return (
                  <li
                    key={adjunto.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <FileText
                      className="size-4 shrink-0 text-tinta-tenue"
                      strokeWidth={1.9}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        marcado
                          ? 'text-tinta-tenue line-through'
                          : 'text-tinta'
                      }`}
                    >
                      {adjunto.nombre}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setABorrar((prev) =>
                          marcado
                            ? prev.filter((id) => id !== adjunto.id)
                            : [...prev, adjunto.id],
                        )
                      }
                      className="shrink-0 text-xs font-medium text-marca-600 hover:underline"
                    >
                      {marcado ? 'Conservar' : 'Quitar'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {nuevos.length > 0 && (
            <ul className="mb-2 divide-y divide-borde rounded-xl border border-borde">
              {nuevos.map((archivo, i) => (
                <li
                  key={`${archivo.name}-${i}`}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Paperclip
                    className="size-4 shrink-0 text-tinta-tenue"
                    strokeWidth={1.9}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                    {archivo.name}
                  </span>
                  <span className="shrink-0 text-xs text-tinta-tenue">
                    {tamanoArchivo(archivo.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setNuevos((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label={`Quitar ${archivo.name}`}
                    className="shrink-0 rounded-full p-1 text-tinta-tenue hover:bg-crema hover:text-tinta"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-borde-fuerte bg-white px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-crema ${
              guardando ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <Paperclip className="size-4" strokeWidth={2} />
            Adjuntar documento
            <input
              type="file"
              multiple
              accept={ACEPTA}
              className="hidden"
              disabled={guardando}
              onChange={(e) => {
                const lista = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (lista.length) anadirArchivos(lista)
              }}
            />
          </label>
          <p className="mt-1.5 text-xs text-tinta-tenue">
            PDF, imagen, Word o texto. Hasta 15 MB por documento.
          </p>

          {fallos.length > 0 && (
            <p className="mt-2 text-xs text-rojo">
              No subieron: {fallos.join(', ')}.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
