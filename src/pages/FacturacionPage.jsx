import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, CreditCard, FilePlus2, ReceiptText } from 'lucide-react'
import Cabecera from '../components/layout/Cabecera'
import Badge from '../components/ui/Badge'
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
import { facturarSesionesPendientes, getMesesConFacturas } from '../services/facturas'
import { getDatosFiscales, sincronizarEstadoFacturas } from '../services/verifacti'
import { euros, normalizar } from '../lib/formato'
import { aClave, etiquetaDia, hoy, MESES } from '../lib/fechas'

const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'pendiente', etiqueta: 'Pendientes' },
  { id: 'pagado', etiqueta: 'Cobradas' },
]

const VISTAS = [
  { id: 'mes', etiqueta: 'Por meses' },
  { id: 'dia', etiqueta: 'Por días' },
]

function etiquetaMes(clave) {
  const [ano, mes] = clave.split('-')
  const nombre = MESES[Number(mes) - 1]
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${ano}`
}

/* «Hoy», «Ayer» o «jueves, 14 de mayo»; con el año cuando la lista
   mezcla varios meses, para que no haya dos «14 de mayo» sin distinguir. */
function etiquetaDiaFactura(clave, conAno) {
  const corta = etiquetaDia(clave)
  const esRelativa = corta === 'Hoy' || corta === 'Ayer' || corta === 'Mañana'
  return conAno && !esRelativa ? `${corta} de ${clave.slice(0, 4)}` : corta
}

const MES_EN_CURSO = aClave(hoy()).slice(0, 7)

export default function FacturacionPage() {
  /* Por defecto sólo el mes en curso: así no se arrastran miles de
     facturas en cada visita. Para ver otro mes se elige en el
     desplegable; «Todos los meses» sí trae la lista entera. */
  const [mesFiltro, setMesFiltro] = useState(MES_EN_CURSO)
  const { facturas, cargando, error, recargar, aplicarCambio } = useFacturas(
    null,
    mesFiltro,
  )

  const [filtro, setFiltro] = useState('todas')
  const [vista, setVista] = useState('mes')
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState(null)
  const [modalManual, setModalManual] = useState(false)

  /* Los meses del desplegable salen de una consulta ligera (sólo la
     fecha), no de las facturas cargadas, que ahora son de un mes. */
  const [mesesDisponibles, setMesesDisponibles] = useState([])
  const [mesesCargados, setMesesCargados] = useState(false)
  useEffect(() => {
    let vivo = true
    getMesesConFacturas().then(({ data }) => {
      if (!vivo) return
      if (data) setMesesDisponibles(data)
      setMesesCargados(true)
    })
    return () => {
      vivo = false
    }
  }, [])

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

  // Con un mes elegido, el resumen es de ese mes; en «Todos», del actual
  const mesResumen = mesFiltro === 'todos' ? MES_EN_CURSO : mesFiltro

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
    // Lo facturado según la forma de cobro apuntada en cada factura
    const deMetodo = (metodo) =>
      delMes.filter((f) => f.metodoPago === metodo).reduce((s, f) => s + f.importe, 0)
    return {
      total,
      cobrado,
      pendiente: total - cobrado,
      numero: delMes.length,
      efectivo: deMetodo('efectivo'),
      tarjeta: deMetodo('tarjeta'),
    }
  }, [facturas, mesResumen])

  // Opciones del desplegable: los meses con factura + el que esté
  // elegido (por si la consulta ligera aún no ha llegado).
  const mesesConFactura = useMemo(() => {
    const claves = new Set(mesesDisponibles)
    if (mesFiltro !== 'todos') claves.add(mesFiltro)
    claves.add(MES_EN_CURSO)
    return [...claves].sort((a, b) => b.localeCompare(a))
  }, [mesesDisponibles, mesFiltro])

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
  // cuadra la contabilidad de la consulta. Los meses van de más reciente
  // a más antiguo y, dentro de cada uno, las facturas por fecha de la
  // sesión (la de emisión si no hay cita), también de nueva a antigua.
  // Las descartadas (sesiones canceladas que no se facturan) van siempre
  // al final de su grupo, para que no tapen las facturas que sí cuentan.
  //
  // En la vista «Por días» el grupo es el día de la sesión: los días van
  // también de más reciente a más antiguo, pero dentro de cada día las
  // sesiones van por hora, de la mañana a la tarde.
  const porGrupo = useMemo(() => {
    const dia = (f) => f.fechaSesion ?? String(f.fechaEmision).slice(0, 10)
    const clave = (f) => `${dia(f)}T${f.horaSesion ?? '00:00'}`
    const alFinal = (f) => (f.estado === 'cancelado' ? 1 : 0)
    const porDias = vista === 'dia'
    const grupos = new Map()
    filtradas.forEach((f) => {
      const g = porDias ? dia(f) : f.mesSesion
      if (!grupos.has(g)) grupos.set(g, [])
      grupos.get(g).push(f)
    })
    for (const lista of grupos.values()) {
      lista.sort(
        (a, b) =>
          alFinal(a) - alFinal(b) ||
          (porDias ? clave(a).localeCompare(clave(b)) : clave(b).localeCompare(clave(a))),
      )
    }
    return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtradas, vista])

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
        <div className="overflow-hidden rounded-2xl border border-marca-200 bg-gradient-to-b from-marca-50 to-marca-50/40 shadow-suave">
          <dl className="grid grid-cols-3 divide-x divide-marca-200">
            <CifraMes
              etiqueta={mesFiltro === 'todos' ? 'Facturado este mes' : 'Facturado'}
              valor={euros(resumen.total)}
              apunte={`${resumen.numero} ${resumen.numero === 1 ? 'factura' : 'facturas'}`}
            />
            <CifraMes etiqueta="Cobrado" valor={euros(resumen.cobrado)} color="text-verde" />
            <CifraMes
              etiqueta="Pendiente de cobro"
              valor={euros(resumen.pendiente)}
              color="text-ambar"
            />
          </dl>
        </div>

        {/* Lo facturado del mes por forma de cobro. Mismos iconos y colores
            que el chip de cada factura, para que se reconozcan. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tono="verde" icono={Banknote}>
            Efectivo · {euros(resumen.efectivo)}
          </Badge>
          <Badge tono="azul" icono={CreditCard}>
            Tarjeta · {euros(resumen.tarjeta)}
          </Badge>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Segmentado opciones={FILTROS} valor={filtro} alCambiar={setFiltro} />
          <Segmentado opciones={VISTAS} valor={vista} alCambiar={setVista} />
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
          <div className="flex-1 sm:min-w-[14rem]">
            <Buscador
              valor={busqueda}
              alCambiar={setBusqueda}
              placeholder="Buscar por paciente o nº de factura…"
            />
          </div>
        </div>
      </Cabecera>

      <AvisoError error={error} alReintentar={recargar} className="mb-4" />

      {busqueda && mesFiltro !== 'todos' && (
        <p className="mb-3 text-sm text-tinta-suave">
          Buscando sólo en {etiquetaMes(mesFiltro).toLowerCase()}.{' '}
          <button
            type="button"
            onClick={() => setMesFiltro('todos')}
            className="font-medium text-marca-600 underline underline-offset-2"
          >
            Buscar en todos los meses
          </button>
        </p>
      )}

      {cargando ? (
        <EsqueletoLista filas={5} />
      ) : porGrupo.length === 0 ? (
        mesesCargados && mesesDisponibles.length === 0 ? (
          <EstadoVacio
            icono={ReceiptText}
            titulo="Todavía no hay facturas"
            texto="Cada sesión genera su factura en cuanto pasa su hora."
          />
        ) : (
          <EstadoVacio
            icono={ReceiptText}
            titulo="No hay facturas que mostrar"
            texto="No hay ninguna en este mes con ese filtro o esa búsqueda."
            accion={
              mesFiltro !== 'todos' && (
                <Boton variante="secundario" onClick={() => setMesFiltro('todos')}>
                  Ver todos los meses
                </Boton>
              )
            }
          />
        )
      ) : (
        <div className="space-y-6">
          {porGrupo.map(([grupo, lista]) => {
            const total = lista
              .filter((f) => f.estado !== 'cancelado')
              .reduce((s, f) => s + f.importe, 0)
            const pendientes = lista.filter((f) => f.estado === 'pendiente').length
            return (
              <section key={grupo}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="font-semibold text-tinta first-letter:uppercase">
                    {vista === 'dia'
                      ? etiquetaDiaFactura(grupo, mesFiltro === 'todos')
                      : etiquetaMes(grupo)}
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

/* Una celda de la banda-resumen del mes. Mismo lenguaje que la tira de
   cifras de la ficha del paciente: etiqueta pequeña en versal, cifra
   grande y tabular. */
function CifraMes({ etiqueta, valor, apunte, color = 'text-tinta' }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-marca-600">
        {etiqueta}
      </dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums tracking-tight sm:text-2xl ${color}`}>
        {valor}
        {apunte && (
          <span className="mt-0.5 block text-xs font-medium tracking-normal text-tinta-tenue">
            {apunte}
          </span>
        )}
      </dd>
    </div>
  )
}
