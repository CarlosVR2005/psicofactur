import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, ReceiptText } from 'lucide-react'
import Cabecera from '../components/layout/Cabecera'
import Card from '../components/ui/Card'
import Boton from '../components/ui/Boton'
import Buscador from '../components/ui/Buscador'
import Segmentado from '../components/ui/Segmentado'
import { Seleccion } from '../components/ui/Campo'
import EstadoVacio from '../components/ui/EstadoVacio'
import AvisoError from '../components/ui/AvisoError'
import Aviso from '../components/ui/Aviso'
import { EsqueletoLista } from '../components/ui/Cargando'
import FacturaFila from '../features/facturacion/FacturaFila'
import FacturaManualModal from '../features/facturacion/FacturaManualModal'
import { useFacturas } from '../hooks/useFacturas'
import { facturarSesionesPendientes } from '../services/facturas'
import { getDatosFiscales, sincronizarEstadoFacturas } from '../services/verifacti'
import { euros, normalizar } from '../lib/formato'
import { aClave, hoy, MESES } from '../lib/fechas'

const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'pendiente', etiqueta: 'Pendientes' },
  { id: 'pagado', etiqueta: 'Cobradas' },
]

function etiquetaMes(clave) {
  const [ano, mes] = clave.split('-')
  const nombre = MESES[Number(mes) - 1]
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${ano}`
}

export default function FacturacionPage() {
  const { facturas, cargando, error, recargar, aplicarCambio } = useFacturas()

  const [filtro, setFiltro] = useState('todas')
  const [mesFiltro, setMesFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState(null)
  const [modalManual, setModalManual] = useState(false)

  /* ¿Veri*Factu encendido? (migración 0028). Apagado —lo normal ahora—,
     «Emitir» cierra la factura en local y no se sondea a Hacienda. */
  const [verifactuActivo, setVerifactuActivo] = useState(false)
  useEffect(() => {
    let vivo = true
    getDatosFiscales().then(({ data }) => {
      if (vivo && data) setVerifactuActivo(data.verifactuActivo === true)
    })
    return () => {
      vivo = false
    }
  }, [])

  const mesEnCurso = aClave(hoy()).slice(0, 7)
  // Con filtro de mes puesto, el resumen es de ese mes; si no, del actual
  const mesResumen = mesFiltro === 'todos' ? mesEnCurso : mesFiltro

  /* Facturar «todo» ya no es un botón: el cron `facturar_citas_pasadas`
     crea la fila borrador de cada sesión celebrada. Al abrir la pantalla
     se hace además una pasada por si el cron aún no ha llegado a una
     sesión recién terminada. */
  useEffect(() => {
    let vivo = true
    facturarSesionesPendientes().then(({ data }) => {
      if (!vivo || !data || data.length === 0) return
      recargar()
      setAviso({
        tipo: 'exito',
        titulo:
          data.length === 1
            ? 'Se ha preparado 1 factura nueva'
            : `Se han preparado ${data.length} facturas nuevas`,
      })
    })
    return () => {
      vivo = false
    }
  }, [recargar])

  /* ---- Confirmación de Hacienda ----------------------------------
     Emitir no es quedar presentada. La AEAT no admite envíos en tiempo
     real: acepta el registro en cola y, si algo está mal, lo rechaza
     alrededor de un minuto después. Ese rechazo no llega solo a ningún
     sitio, hay que ir a buscarlo.

     Mientras haya alguna factura sin resolver se pregunta cada minuto.
     En cuanto se resuelven todas, `hayPendientes` pasa a false y el
     intervalo se limpia; el tope es una red de seguridad por si alguna
     se quedara encallada en la AEAT y la pantalla se dejara abierta. */
  const hayPendientes = useMemo(
    () => verifactuActivo && facturas.some((f) => f.verifactuEstado === 'Pendiente'),
    [verifactuActivo, facturas],
  )
  const intentos = useRef(0)

  const comprobarEnHacienda = useCallback(async () => {
    const { data } = await sincronizarEstadoFacturas()
    if (!data || (data.resueltas === 0 && data.rechazadas === 0)) return

    recargar()

    if (data.rechazadas > 0) {
      const [primero] = data.problemas
      setAviso({
        tipo: 'error',
        titulo:
          data.rechazadas === 1
            ? `Hacienda ha rechazado la factura ${primero?.numero ?? ''}`.trim()
            : `Hacienda ha rechazado ${data.rechazadas} facturas`,
        detalle: primero?.motivo,
      })
    }
  }, [recargar])

  useEffect(() => {
    if (!hayPendientes) {
      intentos.current = 0
      return
    }
    if (intentos.current >= 10) return

    intentos.current += 1
    comprobarEnHacienda()

    const id = setInterval(() => {
      if (intentos.current >= 10) return
      intentos.current += 1
      comprobarEnHacienda()
    }, 60000)
    return () => clearInterval(id)
  }, [hayPendientes, comprobarEnHacienda])

  /* Resumen del mes (el actual, o el que filtre la psicóloga).

     Ni las anuladas ni las rectificadas cuentan. Lo segundo importa
     desde que existen las rectificativas: la original y la que la
     sustituye conviven en la lista, así que sumarlas las dos inflaría
     el total del mes con dinero que sólo se cobra una vez. */
  const resumen = useMemo(() => {
    const delMes = facturas.filter(
      (f) => f.mesSesion === mesResumen && f.estado !== 'cancelado' && f.estado !== 'anulada',
    )
    const total = delMes.reduce((s, f) => s + f.importe, 0)
    const cobrado = delMes
      .filter((f) => f.estado === 'pagado')
      .reduce((s, f) => s + f.importe, 0)
    return { total, cobrado, pendiente: total - cobrado, numero: delMes.length }
  }, [facturas, mesResumen])

  // Los meses (de sesión) que tienen alguna factura, para el desplegable
  const mesesConFactura = useMemo(() => {
    const claves = new Set(facturas.map((f) => f.mesSesion))
    return [...claves].sort((a, b) => b.localeCompare(a))
  }, [facturas])

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return facturas.filter((f) => {
      if (filtro !== 'todas' && f.estado !== filtro) return false
      if (mesFiltro !== 'todos' && f.mesSesion !== mesFiltro) return false
      if (!q) return true
      return normalizar(f.pacienteNombre).includes(q) || f.numero.includes(q)
    })
  }, [facturas, filtro, mesFiltro, busqueda])

  // Agrupadas por el mes de la SESIÓN (no el de emisión): es como se
  // cuadra la contabilidad de la consulta.
  const porMes = useMemo(() => {
    const grupos = new Map()
    filtradas.forEach((f) => {
      if (!grupos.has(f.mesSesion)) grupos.set(f.mesSesion, [])
      grupos.get(f.mesSesion).push(f)
    })
    return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtradas])

  /* Rectificar crea una factura NUEVA y anula la original: cambian dos
     filas a la vez, así que no vale con retocar una. Se recarga. */
  const alRectificarFactura = (resultado) => {
    setAviso(resultado)
    recargar()
  }

  return (
    <>
      <Cabecera
        titulo="Facturación"
        subtitulo={`Resumen de ${etiquetaMes(mesResumen)}`}
        accion={
          <Boton icono={FilePlus2} onClick={() => setModalManual(true)}>
            Nueva factura
          </Boton>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Resumen
            etiqueta={mesFiltro === 'todos' ? 'Facturado este mes' : 'Facturado'}
            valor={euros(resumen.total)}
            detalle={`${resumen.numero} ${resumen.numero === 1 ? 'factura' : 'facturas'}`}
          />
          <Resumen etiqueta="Cobrado" valor={euros(resumen.cobrado)} color="text-verde" />
          <Resumen
            etiqueta="Pendiente de cobro"
            valor={euros(resumen.pendiente)}
            color="text-ambar"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmentado opciones={FILTROS} valor={filtro} alCambiar={setFiltro} />
          <Seleccion
            value={mesFiltro}
            onChange={(e) => setMesFiltro(e.target.value)}
            aria-label="Filtrar por mes de la sesión"
            className="sm:w-52"
          >
            <option value="todos">Todos los meses</option>
            {mesesConFactura.map((m) => (
              <option key={m} value={m}>
                {etiquetaMes(m)}
              </option>
            ))}
          </Seleccion>
          <div className="flex-1">
            <Buscador
              valor={busqueda}
              alCambiar={setBusqueda}
              placeholder="Buscar por paciente o nº de factura…"
            />
          </div>
        </div>
      </Cabecera>

      <AvisoError error={error} alReintentar={recargar} className="mb-4" />

      {cargando ? (
        <EsqueletoLista filas={5} />
      ) : porMes.length === 0 ? (
        <EstadoVacio
          icono={ReceiptText}
          titulo={
            facturas.length === 0
              ? 'Todavía no hay facturas'
              : 'No hay facturas que mostrar'
          }
          texto={
            facturas.length === 0
              ? 'Cada sesión genera su factura en cuanto pasa su hora.'
              : 'Prueba a cambiar el filtro, el mes o el texto de búsqueda.'
          }
        />
      ) : (
        <div className="space-y-6">
          {porMes.map(([mes, lista]) => {
            const total = lista
              .filter((f) => f.estado !== 'cancelado')
              .reduce((s, f) => s + f.importe, 0)
            const pendientes = lista.filter((f) => f.estado === 'pendiente').length
            return (
              <section key={mes}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="font-semibold text-tinta first-letter:uppercase">
                    {etiquetaMes(mes)}
                  </h2>
                  <p className="text-sm text-tinta-suave">
                    {euros(total)}
                    {pendientes > 0 && (
                      <span className="text-ambar"> · {pendientes} sin cobrar</span>
                    )}
                  </p>
                </div>
                <Card className="divide-y divide-borde overflow-hidden">
                  {lista.map((f) => (
                    <FacturaFila
                      key={f.id}
                      factura={f}
                      verifactuActivo={verifactuActivo}
                      alCambiar={aplicarCambio}
                      alFallar={setAviso}
                      alRectificar={alRectificarFactura}
                    />
                  ))}
                </Card>
              </section>
            )
          })}
        </div>
      )}

      <FacturaManualModal
        abierto={modalManual}
        alCerrar={() => setModalManual(false)}
        alCreada={(resultado) => {
          setModalManual(false)
          setAviso(resultado)
          aplicarCambio(resultado.factura)
        }}
        alFallar={setAviso}
      />

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}

function Resumen({ etiqueta, valor, detalle, color = 'text-tinta', className = '' }) {
  return (
    <Card className={`px-4 py-3.5 ${className}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">
        {etiqueta}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>
        {valor}
      </p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
    </Card>
  )
}
