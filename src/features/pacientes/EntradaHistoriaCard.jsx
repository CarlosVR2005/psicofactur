import { useState } from 'react'
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import Card from '../../components/ui/Card'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { urlFirmadaAdjunto } from '../../services/historia'
import { fechaNumerica } from '../../lib/fechas'
import { tamanoArchivo } from '../../lib/formato'

/* ================================================================
   UNA ENTRADA de la historia clínica

   Sólo pinta y descarga. El texto se respeta tal cual se escribió
   (`whitespace-pre-line`), igual que las Observaciones. Los documentos
   se guardan en un bucket privado: al pulsar «descargar» se pide un
   enlace firmado de un minuto y se abre; no hay URL permanente.

   Editar y borrar abren sus modales desde la pestaña.
   ================================================================ */

function iconoDeAdjunto(tipoMime) {
  return tipoMime?.startsWith('image/') ? ImageIcon : FileText
}

export default function EntradaHistoriaCard({ entrada, alEditar, alEliminar }) {
  const [descargando, setDescargando] = useState(null)
  const [error, setError] = useState(null)

  const descargar = async (adjunto) => {
    if (descargando) return
    setError(null)
    setDescargando(adjunto.id)
    const { data: url, error: fallo } = await urlFirmadaAdjunto(adjunto)
    setDescargando(null)
    if (fallo) {
      setError(fallo)
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">
            {fechaNumerica(entrada.fecha)}
          </p>
          <h3 className="mt-0.5 font-semibold text-tinta">{entrada.titulo}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={alEditar}>
            Editar
          </Boton>
          <Boton
            variante="fantasma"
            tamano="sm"
            icono={Trash2}
            onClick={alEliminar}
            className="text-rojo hover:bg-rojo-suave hover:text-rojo"
          >
            Borrar
          </Boton>
        </div>
      </div>

      {entrada.texto && (
        <p className="mt-3 whitespace-pre-line leading-relaxed text-tinta-suave">
          {entrada.texto}
        </p>
      )}

      {entrada.adjuntos.length > 0 && (
        <ul className="mt-4 divide-y divide-borde rounded-2xl border border-borde">
          {entrada.adjuntos.map((adjunto) => {
            const Icono = iconoDeAdjunto(adjunto.tipoMime)
            return (
              <li
                key={adjunto.id}
                className="flex items-center gap-3 px-3.5 py-3"
              >
                <Icono
                  className="size-5 shrink-0 text-tinta-tenue"
                  strokeWidth={1.9}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tinta">
                    {adjunto.nombre}
                  </p>
                  {tamanoArchivo(adjunto.tamano) && (
                    <p className="text-xs text-tinta-tenue">
                      {tamanoArchivo(adjunto.tamano)}
                    </p>
                  )}
                </div>
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  icono={descargando === adjunto.id ? undefined : Download}
                  onClick={() => descargar(adjunto)}
                  disabled={Boolean(descargando)}
                  aria-label={`Descargar ${adjunto.nombre}`}
                >
                  {descargando === adjunto.id ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
                  ) : (
                    'Descargar'
                  )}
                </Boton>
              </li>
            )
          })}
        </ul>
      )}

      <AvisoError error={error} className="mt-3" />
    </Card>
  )
}
