import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import Segmentado from '../../components/ui/Segmentado'
import { Campo, Seleccion } from '../../components/ui/Campo'
import {
  completarPacientesEnLote,
  crearPacientesEnLote,
  getPacientes,
} from '../../services/pacientes'
import { descargarTexto, generarCsv } from '../../lib/csv'
import {
  analizarImportacion,
  CAMPOS,
  detectarColumnas,
  filasDeExportacion,
  leerArchivoDePacientes,
} from '../../lib/pacientesCsv'
import { aClave, hoy } from '../../lib/fechas'

/* ================================================================
   IMPORTAR / EXPORTAR PACIENTES

   Las dos mitades de lo mismo —los pacientes entran o salen— así que
   comparten ventana: se busca «lo de pasar la lista» en un único
   sitio y no en dos botones distintos.

   La importación NO se hace de golpe al elegir el archivo. Primero se
   lee, se enseña qué ha entendido (cuántos son nuevos, cuáles ya
   están, qué columna es cada cosa) y sólo entonces hay un botón para
   confirmar. Meter 300 fichas equivocadas en la base de datos se
   deshace de una en una; enseñarlas antes cuesta una pantalla.
   ================================================================ */

const PESTANAS = [
  { id: 'importar', etiqueta: 'Importar' },
  { id: 'exportar', etiqueta: 'Exportar' },
]

const QUE_HACER_CON_DUPLICADOS = [
  { id: 'completar', etiqueta: 'Completar' },
  { id: 'omitir', etiqueta: 'Dejarlos como están' },
]

const AMBITOS = [
  { id: 'activos', etiqueta: 'En activo' },
  { id: 'todos', etiqueta: 'Con archivados' },
]

export default function ImportarExportarModal({ abierto, alCerrar, alRecargar, alAvisar }) {
  const [pestana, setPestana] = useState('importar')
  const [error, setError] = useState(null)
  const [trabajando, setTrabajando] = useState(false)

  /* La lista completa, archivados incluidos. Sirve para las dos cosas:
     para saber quién está ya dentro al importar y para lo que se saca
     al exportar. Se pide al abrir, no se hereda de la pantalla, para
     que el filtro que ella tenga puesto no decida qué se exporta. */
  const [existentes, setExistentes] = useState([])
  const [cargandoExistentes, setCargandoExistentes] = useState(true)

  const [archivo, setArchivo] = useState(null) // { nombre, hoja, cabeceras, filas }
  const [mapa, setMapa] = useState({})
  const [duplicados, setDuplicados] = useState('completar')
  const [arrastrando, setArrastrando] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const entrada = useRef(null)

  const [ambito, setAmbito] = useState('activos')

  useEffect(() => {
    if (!abierto) return
    setPestana('importar')
    setError(null)
    setArchivo(null)
    setMapa({})
    setLeyendo(false)
    setDuplicados('completar')
    setAmbito('activos')

    let vigente = true
    setCargandoExistentes(true)
    getPacientes({ incluirArchivados: true }).then(({ data, error: fallo }) => {
      if (!vigente) return
      setExistentes(data ?? [])
      if (fallo) setError(fallo)
      setCargandoExistentes(false)
    })
    return () => {
      vigente = false
    }
  }, [abierto])

  /* ---- Importar --------------------------------------------------- */

  const cargarArchivo = useCallback(async (elegido) => {
    if (!elegido) return
    setError(null)
    setLeyendo(true)

    try {
      const { cabeceras, filas, hoja } = await leerArchivoDePacientes(elegido)

      if (cabeceras.length === 0 || filas.length === 0) {
        setError(
          'El archivo está vacío o no tiene ninguna fila debajo de la cabecera. ' +
            'La primera línea tiene que ser el nombre de las columnas.',
        )
        return
      }

      setArchivo({ nombre: elegido.name, hoja, cabeceras, filas })
      setMapa(detectarColumnas(cabeceras))
    } catch (e) {
      console.error('[Psicofactur] no se ha podido leer el archivo:', e)
      // `leerArchivoDePacientes` marca como `amable` lo que ya está
      // escrito para leerse aquí; lo demás no se enseña tal cual
      setError(
        e?.amable
          ? e.message
          : 'No se ha podido leer el archivo. Tiene que ser un CSV o un Excel (.xlsx).',
      )
    } finally {
      setLeyendo(false)
    }
  }, [])

  const analisis = useMemo(() => {
    if (!archivo) return []
    return analizarImportacion({ filas: archivo.filas, mapa, existentes })
  }, [archivo, mapa, existentes])

  const nuevos = useMemo(() => analisis.filter((f) => f.estado === 'nuevo'), [analisis])
  const yaEstaban = useMemo(() => analisis.filter((f) => f.estado === 'duplicado'), [analisis])
  const sinNombre = useMemo(() => analisis.filter((f) => f.estado === 'sin-nombre'), [analisis])

  /* Los duplicados a los que el archivo les completa algún hueco. Los
     que vienen de una línea anterior del propio archivo no tienen id
     todavía: ésos no se pueden actualizar, sólo ignorar. */
  const completables = useMemo(
    () =>
      yaEstaban.filter(
        (f) => f.existente?.id && Object.keys(f.relleno ?? {}).length > 0,
      ),
    [yaEstaban],
  )

  const conAvisos = useMemo(
    () => analisis.filter((f) => f.avisos.length > 0 && f.estado !== 'sin-nombre'),
    [analisis],
  )

  const aCompletar = duplicados === 'completar' ? completables : []
  const totalAGuardar = nuevos.length + aCompletar.length

  const importar = async () => {
    setTrabajando(true)
    setError(null)

    const { data: alta, error: falloAlta } = await crearPacientesEnLote(
      nuevos.map((f) => f.paciente),
    )
    const creados = alta?.creados?.length ?? 0

    let actualizados = 0
    let fallo = falloAlta

    if (!fallo && aCompletar.length > 0) {
      const { data: relleno, error: falloRelleno } = await completarPacientesEnLote(
        aCompletar.map((f) => ({
          id: f.existente.id,
          datos: { ...f.existente, ...f.relleno },
        })),
      )
      actualizados = relleno?.actualizados?.length ?? 0
      fallo = falloRelleno
    }

    setTrabajando(false)

    // Aunque haya fallado a medias, lo que entró tiene que verse ya
    if (creados > 0 || actualizados > 0) alRecargar?.()

    if (fallo) {
      setError({
        mensaje:
          creados + actualizados > 0
            ? `${fallo.mensaje} Se habían guardado ${creados + actualizados} de ${totalAGuardar}: ` +
              'vuelve a importar el mismo archivo y los que ya estén se reconocerán como repetidos.'
            : fallo.mensaje,
      })
      return
    }

    alAvisar?.({
      tipo: 'exito',
      titulo:
        creados === 1
          ? 'Se ha importado 1 paciente'
          : `Se han importado ${creados} pacientes`,
      detalle:
        actualizados > 0
          ? `Y se han completado ${actualizados} ${actualizados === 1 ? 'ficha' : 'fichas'} que ya existían.`
          : undefined,
    })
    alCerrar()
  }

  /* ---- Exportar --------------------------------------------------- */

  const paraExportar = useMemo(
    () => (ambito === 'todos' ? existentes : existentes.filter((p) => p.activo)),
    [existentes, ambito],
  )

  const exportar = () => {
    const { cabeceras, filas } = filasDeExportacion(paraExportar)
    descargarTexto(`pacientes-${aClave(hoy())}.csv`, generarCsv(cabeceras, filas))
    alAvisar?.({
      tipo: 'exito',
      titulo: `Se han guardado ${paraExportar.length} ${paraExportar.length === 1 ? 'paciente' : 'pacientes'}`,
      detalle: 'Busca el archivo en tus descargas.',
    })
    alCerrar()
  }

  /* ---- Pie de la ventana ------------------------------------------ */

  const pie =
    pestana === 'exportar' ? (
      <>
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton
          icono={Download}
          onClick={exportar}
          disabled={cargandoExistentes || paraExportar.length === 0}
        >
          Descargar CSV
        </Boton>
      </>
    ) : (
      <>
        <Boton variante="secundario" onClick={alCerrar} disabled={trabajando}>
          Cancelar
        </Boton>
        {archivo && (
          <Boton onClick={importar} disabled={trabajando || totalAGuardar === 0}>
            {trabajando
              ? 'Importando…'
              : totalAGuardar === 0
                ? 'No hay nada que importar'
                : `Importar ${totalAGuardar} ${totalAGuardar === 1 ? 'ficha' : 'fichas'}`}
          </Boton>
        )}
      </>
    )

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Importar y exportar pacientes"
      descripcion="Pasa la lista desde otro programa, o llévate la tuya."
      pie={pie}
    >
      <div className="space-y-5">
        <Segmentado
          opciones={PESTANAS}
          valor={pestana}
          alCambiar={(id) => {
            setPestana(id)
            setError(null)
          }}
          className="w-full sm:w-auto"
        />

        <AvisoError error={error} />

        {pestana === 'exportar' ? (
          <PanelExportar
            ambito={ambito}
            alCambiarAmbito={setAmbito}
            cargando={cargandoExistentes}
            cuantos={paraExportar.length}
          />
        ) : !archivo ? (
          <ZonaArchivo
            arrastrando={arrastrando}
            alArrastrar={setArrastrando}
            alElegir={cargarArchivo}
            entrada={entrada}
            leyendo={leyendo}
          />
        ) : (
          <PanelImportar
            archivo={archivo}
            cabeceras={archivo.cabeceras}
            mapa={mapa}
            alCambiarMapa={setMapa}
            analisis={analisis}
            nuevos={nuevos.length}
            yaEstaban={yaEstaban.length}
            sinNombre={sinNombre.length}
            completables={completables.length}
            conAvisos={conAvisos}
            duplicados={duplicados}
            alCambiarDuplicados={setDuplicados}
            alCambiarArchivo={() => {
              setArchivo(null)
              setError(null)
            }}
          />
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------
   Elegir el archivo
   ------------------------------------------------------------------ */

function ZonaArchivo({ arrastrando, alArrastrar, alElegir, entrada, leyendo }) {
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          alArrastrar(true)
        }}
        onDragLeave={() => alArrastrar(false)}
        onDrop={(e) => {
          e.preventDefault()
          alArrastrar(false)
          alElegir(e.dataTransfer.files?.[0])
        }}
        className={`rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
          arrastrando ? 'border-marca-400 bg-marca-50' : 'border-borde-fuerte bg-crema/50'
        }`}
      >
        {leyendo ? (
          <Loader2 className="mx-auto size-8 animate-spin text-marca-500" strokeWidth={1.6} />
        ) : (
          <FileSpreadsheet className="mx-auto size-8 text-tinta-tenue" strokeWidth={1.6} />
        )}
        <p className="mt-3 text-sm text-tinta-suave">
          {leyendo ? 'Leyendo el archivo…' : 'Arrastra aquí el Excel o el CSV, o'}
        </p>
        {!leyendo && (
          <Boton
            variante="secundario"
            icono={Upload}
            className="mt-3"
            onClick={() => entrada.current?.click()}
          >
            Elegir archivo
          </Boton>
        )}
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            alElegir(e.target.files?.[0])
            // Para poder volver a elegir el mismo archivo si se corrige
            e.target.value = ''
          }}
        />
      </div>

      <div className="rounded-2xl bg-crema px-4 py-3.5 text-sm text-tinta-suave">
        <p className="font-medium text-tinta">Cómo sacar la lista del otro programa</p>
        <p className="mt-1.5">
          Vale un <span className="text-tinta">Excel (.xlsx)</span> tal cual, o el CSV que
          genera el «Exportar» de casi cualquier programa. Del .xlsx se lee la primera hoja.
          Si lo que tienes es un Excel antiguo (.xls), ábrelo y guárdalo como .xlsx.
        </p>
        <p className="mt-1.5">
          La primera línea del archivo tiene que ser el nombre de las columnas (Nombre,
          Teléfono, DNI…). No importa el orden ni que sobren columnas: aquí se elige
          después qué es cada cosa.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------
   Lo que se ha entendido del archivo
   ------------------------------------------------------------------ */

function PanelImportar({
  archivo,
  cabeceras,
  mapa,
  alCambiarMapa,
  analisis,
  nuevos,
  yaEstaban,
  sinNombre,
  completables,
  conAvisos,
  duplicados,
  alCambiarDuplicados,
  alCambiarArchivo,
}) {
  const faltaNombre = mapa.nombre === undefined && mapa.apellidos === undefined
  const muestra = analisis.filter((f) => f.estado !== 'sin-nombre').slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-borde bg-white px-3.5 py-2.5">
        <FileSpreadsheet className="size-5 shrink-0 text-tinta-tenue" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-tinta">{archivo.nombre}</p>
          <p className="text-xs text-tinta-tenue">
            {archivo.hoja && `Hoja «${archivo.hoja}» · `}
            {archivo.filas.length} {archivo.filas.length === 1 ? 'línea' : 'líneas'} ·{' '}
            {cabeceras.length} columnas
          </p>
        </div>
        <button
          type="button"
          onClick={alCambiarArchivo}
          className="shrink-0 text-sm font-medium text-marca-700 hover:underline"
        >
          Cambiar
        </button>
      </div>

      {faltaNombre ? (
        <div className="flex gap-3 rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3.5">
          <TriangleAlert className="size-5 shrink-0 text-ambar" strokeWidth={2} />
          <p className="text-sm text-tinta">
            No se ha reconocido la columna del nombre. Elígela abajo, en «Qué es cada
            columna»: sin nombre no se puede crear una ficha.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          <Recuento numero={nuevos} etiqueta={nuevos === 1 ? 'nuevo' : 'nuevos'} tono="verde" />
          <Recuento
            numero={yaEstaban}
            etiqueta={yaEstaban === 1 ? 'ya estaba' : 'ya estaban'}
            tono="azul"
          />
          <Recuento
            numero={sinNombre}
            etiqueta={sinNombre === 1 ? 'sin nombre' : 'sin nombre'}
            tono={sinNombre > 0 ? 'ambar' : 'neutro'}
          />
        </div>
      )}

      {yaEstaban > 0 && (
        <div className="rounded-2xl border border-borde bg-crema/60 px-4 py-3.5">
          <p className="text-sm font-medium text-tinta">
            {yaEstaban === 1
              ? '1 paciente del archivo ya está en la aplicación'
              : `${yaEstaban} pacientes del archivo ya están en la aplicación`}
          </p>
          <p className="mt-1 text-sm text-tinta-suave">
            {completables > 0
              ? `El archivo puede rellenar huecos en ${completables} ${completables === 1 ? 'ficha' : 'fichas'} (un DNI que falta, un correo…). Nunca se pisa un dato que ya esté escrito aquí.`
              : 'No traen ningún dato que aquí falte, así que no se tocan.'}
          </p>
          {completables > 0 && (
            <Segmentado
              opciones={QUE_HACER_CON_DUPLICADOS}
              valor={duplicados}
              alCambiar={alCambiarDuplicados}
              className="mt-3"
            />
          )}
        </div>
      )}

      {sinNombre > 0 && (
        <p className="text-sm text-tinta-suave">
          {sinNombre === 1
            ? 'Hay 1 línea sin nombre y se va a ignorar.'
            : `Hay ${sinNombre} líneas sin nombre y se van a ignorar.`}{' '}
          Suelen ser filas de totales o separadores del otro programa.
        </p>
      )}

      {conAvisos.length > 0 && (
        <details className="rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-tinta">
            {conAvisos.length === 1
              ? '1 línea para revisar después'
              : `${conAvisos.length} líneas para revisar después`}
          </summary>
          <ul className="mt-2.5 space-y-1.5 text-sm text-tinta-suave">
            {conAvisos.slice(0, 8).map((f) => (
              <li key={f.linea}>
                <span className="text-tinta">Línea {f.linea}</span> ·{' '}
                {f.paciente.nombre || 'sin nombre'}: {f.avisos.join(' ')}
              </li>
            ))}
            {conAvisos.length > 8 && (
              <li className="text-tinta-tenue">y {conAvisos.length - 8} más…</li>
            )}
          </ul>
          <p className="mt-2.5 text-xs text-tinta-tenue">
            Se importan igualmente: sólo es un dato a comprobar en la ficha.
          </p>
        </details>
      )}

      {muestra.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-tinta-suave">Así se van a guardar</p>
          <div className="overflow-x-auto rounded-xl border border-borde">
            <table className="w-full text-left text-sm">
              <thead className="bg-crema text-xs uppercase tracking-wide text-tinta-tenue">
                <tr>
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">DNI</th>
                  <th className="px-3 py-2 font-medium">Teléfono</th>
                  <th className="px-3 py-2 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {muestra.map((f) => (
                  <tr key={f.linea} className="border-t border-borde">
                    <td className="max-w-[12rem] truncate px-3 py-2 text-tinta">
                      {f.paciente.nombre}
                    </td>
                    <td className="px-3 py-2 text-tinta-suave">{f.paciente.dni || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-tinta-suave">
                      {f.paciente.telefono || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {f.estado === 'nuevo' ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-verde">
                          <CheckCircle2 className="size-3.5" strokeWidth={2.2} /> nuevo
                        </span>
                      ) : (
                        <span className="whitespace-nowrap text-xs text-tinta-tenue">
                          ya estaba
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <details open={faltaNombre} className="rounded-2xl border border-borde px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-tinta">
          Qué es cada columna
        </summary>
        <p className="mt-1.5 text-sm text-tinta-suave">
          Se ha adivinado por el nombre de la cabecera. Cámbialo si algo no cuadra.
        </p>
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
          {CAMPOS.map((campo) => (
            <Campo key={campo.id} etiqueta={campo.etiqueta} ayuda={campo.ayuda}>
              <Seleccion
                value={mapa[campo.id] ?? ''}
                onChange={(e) => {
                  const valor = e.target.value
                  alCambiarMapa((m) => {
                    const siguiente = { ...m }
                    if (valor === '') delete siguiente[campo.id]
                    else siguiente[campo.id] = Number(valor)
                    return siguiente
                  })
                }}
              >
                <option value="">— no usar —</option>
                {cabeceras.map((cabecera, i) => (
                  <option key={i} value={i}>
                    {cabecera || `Columna ${i + 1}`}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          ))}
        </div>
      </details>
    </div>
  )
}

const TONOS = {
  verde: 'border-verde/25 bg-verde-suave text-verde',
  azul: 'border-azul/25 bg-azul-suave text-azul',
  ambar: 'border-ambar/25 bg-ambar-suave text-ambar',
  neutro: 'border-borde bg-crema text-tinta-tenue',
}

function Recuento({ numero, etiqueta, tono }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${TONOS[tono]}`}>
      <p className="text-xl font-semibold">{numero}</p>
      <p className="text-xs">{etiqueta}</p>
    </div>
  )
}

/* ------------------------------------------------------------------
   Sacar la lista
   ------------------------------------------------------------------ */

function PanelExportar({ ambito, alCambiarAmbito, cargando, cuantos }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-suave">
        Se descarga un CSV con la ficha de cada paciente: nombre, DNI, teléfono, correo,
        fecha de nacimiento, precio por sesión, inicio de la terapia y observaciones. Se
        abre en Excel de un doble clic y lo lee cualquier otro programa.
      </p>

      <Segmentado opciones={AMBITOS} valor={ambito} alCambiar={alCambiarAmbito} />

      <div className="flex items-center gap-3 rounded-2xl border border-borde bg-crema/60 px-4 py-3.5">
        <ArrowRight className="size-5 shrink-0 text-tinta-tenue" strokeWidth={2} />
        <p className="text-sm text-tinta">
          {cargando
            ? 'Contando pacientes…'
            : cuantos === 0
              ? 'No hay ningún paciente que exportar todavía.'
              : `Se guardarán ${cuantos} ${cuantos === 1 ? 'paciente' : 'pacientes'} en un archivo.`}
        </p>
      </div>

      <p className="text-sm text-tinta-suave">
        El archivo lleva datos de salud identificables: guárdalo en un sitio de
        confianza y bórralo del ordenador cuando ya no lo necesites. No incluye las
        citas, las facturas ni los consentimientos firmados.
      </p>
    </div>
  )
}
