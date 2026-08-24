/* ================================================================
   VERIFACTI — registro de facturación Veri*Factu ante la AEAT

   Todo lo que habla con Verifacti vive aquí.

   Secreto que hay que poner en Supabase → Edge Functions → Secrets:
     VERIFACTI_API_KEY   la key del panel de Verifacti

   Y una cosa importante que no se ve en el código: **la API key
   determina el NIF emisor y el entorno**. Verifacti lo dice así:

     «Al registrar un NIF en nuestro dashboard, se generará una API key
      (de test o de producción)… De esa forma, el NIF del emisor de la
      factura y el entorno vienen determinados por la API key.»

   Por eso en el JSON no va ningún dato de la psicóloga: ni NIF, ni
   razón social, ni dirección. Van los del PACIENTE, que es el
   destinatario. Los de ella se comprueban antes en la app (para el PDF
   y para avisarla si le faltan), pero no viajan aquí.

   Consecuencia práctica: con la key de test, los envíos van al entorno
   de pruebas de la AEAT y NO tienen validez legal. Antes de facturar a
   pacientes de verdad hay que cambiar el secreto por la key de
   producción.
   ================================================================ */

const API = 'https://api.verifacti.com'
const API_KEY = Deno.env.get('VERIFACTI_API_KEY') ?? ''

export function verifactiConfigurado(): boolean {
  return Boolean(API_KEY)
}

/* ---------------------- Formatos ---------------------- */

/* Verifacti quiere DD-MM-YYYY y la base guarda YYYY-MM-DD. */
export function fechaParaVerifacti(fechaIso: string): string {
  const [ano, mes, dia] = String(fechaIso).slice(0, 10).split('-')
  return `${dia}-${mes}-${ano}`
}

/** Hoy en Europe/Madrid, como YYYY-MM-DD. */
export function hoyEnMadrid(): string {
  // `en-CA` da directamente el formato ISO corto
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/* Todos los importes viajan como STRING con dos decimales. El patrón
   que valida Verifacti es (+|-)?\d{1,12}(\.\d{0,2})? — nada de comas ni
   de separador de miles. */
export function importeParaVerifacti(n: number): string {
  return (Math.round(Number(n) * 100) / 100).toFixed(2)
}

/**
 * Parte «2026/0001» en la serie y el número que espera la AEAT.
 * Las rectificativas llegan como «R2026/0001» y salen con serie «R2026/»,
 * que es justo la serie aparte que exige el reglamento.
 *
 * La barra se queda DENTRO de la serie, y no es un descuido. La AEAT
 * identifica la factura por serie y número pegados: con serie «2026» y
 * número «0001» el QR de verificación diría «20260001», y en el papel
 * pone «2026/0001». Dejando la barra en la serie, el registro de
 * Hacienda y la factura impresa dicen exactamente lo mismo.
 * (Comprobado contra el entorno de pruebas: la barra se acepta.)
 */
export function partirNumeroFactura(numeroFactura: string): {
  serie: string
  numero: string
} {
  const bruto = String(numeroFactura ?? '').trim()
  const barra = bruto.lastIndexOf('/')
  if (barra === -1) return { serie: '', numero: bruto }
  return { serie: bruto.slice(0, barra + 1), numero: bruto.slice(barra + 1) }
}

/* ---------------------- Tipos ---------------------- */

export interface Destinatario {
  /** DNI/NIF del paciente. Sin él la factura sale simplificada (F2). */
  nif?: string | null
  nombre?: string | null
}

export interface DatosFactura {
  /** Tal y como lo asignó la base: «2026/0001» */
  numeroFactura: string
  /** YYYY-MM-DD. Tiene que ser HOY: lo exige Verifacti. */
  fechaEmision: string
  /** YYYY-MM-DD del día de la sesión, si no es hoy. */
  fechaOperacion?: string | null
  descripcion: string
  /** Lo que paga el paciente, IVA incluido si lo llevara. */
  importe: number
  destinatario: Destinatario
  /**
   * Código de exención de IVA. 'E1' = artículo 20 de la Ley 37/1992,
   * que es la exención sanitaria de las sesiones de psicoterapia.
   * Con null la operación va sujeta al `tipoImpositivo`.
   */
  exencion?: string | null
  /** Sólo si NO está exenta: 21, 10, 4… */
  tipoImpositivo?: number | null
  /**
   * Verifacti comprueba por defecto que el NIF esté censado en la AEAT,
   * porque si no lo está la AEAT rechaza el envío. En el entorno de
   * pruebas se puede desactivar para poder usar DNIs inventados.
   */
  validarDestinatario?: boolean
}

export interface RespuestaVerifacti {
  uuid: string
  /** Al crear siempre vuelve «Pendiente». */
  estado: string
  /** URL de verificación de la AEAT: es lo que codifica el QR. */
  url: string
  /** El QR ya pintado, PNG en base64. */
  qr: string
  /** Huella o hash del registro, la que encadena unas facturas con otras. */
  huella: string
}

/* ---------------------- Errores ---------------------- */

/**
 * Un fallo de Verifacti con dos caras: `mensaje` está escrito para que
 * lo entienda quien está delante de la pantalla, y `tecnico` es lo que
 * respondió la API, que es lo que sirve para depurar.
 */
export class ErrorVerifacti extends Error {
  readonly tecnico: string
  readonly estadoHttp: number

  constructor(mensaje: string, tecnico: string, estadoHttp: number) {
    super(mensaje)
    this.name = 'ErrorVerifacti'
    this.tecnico = tecnico
    this.estadoHttp = estadoHttp
  }
}

/*
 * Verifacti devuelve el error como una frase suelta en castellano
 * («El campo tipo_factura debe ser F1, F2, R1…»). Está bien escrita,
 * pero habla de campos de una API que la psicóloga no ha visto nunca.
 * Aquí se traduce a lo que ella puede ARREGLAR: qué dato está mal y
 * dónde se corrige.
 */
function mensajeAmable(textoError: string, estadoHttp: number): string {
  const t = textoError.toLowerCase()

  if (estadoHttp === 401 || estadoHttp === 403) {
    return 'Verifacti no ha aceptado la clave de acceso. Hay que revisar la configuración de facturación.'
  }
  if (estadoHttp === 429) {
    return 'Verifacti está recibiendo demasiadas peticiones ahora mismo. Espera un minuto y vuelve a darle a Emitir.'
  }
  if (estadoHttp >= 500) {
    return 'Verifacti no responde en este momento. La factura no se ha enviado; inténtalo de nuevo en unos minutos.'
  }

  /* Lo más habitual con diferencia: el DNI del paciente. Los textos que
     se buscan aquí son los REALES, comprobados contra su entorno de
     pruebas, no una suposición:

       · Verifacti (síncrono, 400):
         «El NIF/NOMBRE (…) del destinatario no se encuentra registrado
          en la Agencia Tributaria…»
       · AEAT (asíncrono, código 1239):
         «Error en el bloque Destinatario.. El formato del NIF es
          incorrecto.. NIF:…»
         «… El NIF no está identificado en el censo de la AEAT…»

     Ojo al orden: el mensaje del censo también contiene «NIF», así que
     tiene que mirarse ANTES que el de formato o saldría el aviso
     equivocado. */
  if (t.includes('formato del nif')) {
    return 'El DNI del paciente está mal escrito: la letra no se corresponde con el número. Revísalo en su ficha y vuelve a intentarlo.'
  }
  if (
    t.includes('censo') ||
    t.includes('censad') ||
    t.includes('no se encuentra registrado') ||
    t.includes('no está identificado')
  ) {
    return 'El DNI del paciente no le consta a Hacienda, o el nombre no coincide con el que ella tiene registrado. Compruébalo en su ficha tal y como aparece en el documento de identidad.'
  }
  if (t.includes('nif') || t.includes('dni')) {
    return 'El DNI del paciente no es válido. Revísalo en su ficha y vuelve a intentarlo.'
  }
  if (t.includes('nombre')) {
    return 'Falta el nombre del paciente o no es válido. Revísalo en su ficha.'
  }
  if (t.includes('fecha')) {
    return 'La fecha de la factura no es válida. Las facturas se emiten siempre con la fecha del día.'
  }
  if (t.includes('importe') || t.includes('base') || t.includes('cuota')) {
    return 'El importe de la factura no cuadra. Revísalo antes de emitirla.'
  }
  if (t.includes('duplicad') || t.includes('ya existe') || t.includes('registrada')) {
    return 'Esa factura ya estaba registrada en Hacienda. Actualiza la pantalla para verla.'
  }
  if (t.includes('serie') || t.includes('numero') || t.includes('número')) {
    return 'El número de factura no es válido para Hacienda. Avisa a quien lleva la aplicación.'
  }
  if (t.includes('descripcion') || t.includes('descripción')) {
    return 'La descripción de la factura no es válida: no puede estar vacía ni pasar de 500 caracteres.'
  }

  return 'Hacienda no ha aceptado la factura. Revisa los datos del paciente y vuelve a intentarlo; si sigue igual, avisa a quien lleva la aplicación.'
}

/* ---------------------- Llamada ---------------------- */

/*
 * La cabecera Idempotency-Key evita que un doble toque o un corte de
 * red registren la sesión dos veces: si llega la misma key con el mismo
 * contenido, Verifacti no crea un segundo registro.
 *
 * Va derivada del contenido a propósito. Si fuera sólo el id de la
 * factura, al reintentar después de CORREGIR un dato (el DNI, por
 * ejemplo) Verifacti respondería 422 —misma key, contenido distinto— y
 * la factura se quedaría atascada para siempre. Con el hash del cuerpo,
 * reintentar lo mismo deduplica y reintentar algo corregido pasa.
 */
async function claveIdempotencia(facturaId: string, cuerpo: unknown): Promise<string> {
  const datos = new TextEncoder().encode(JSON.stringify(cuerpo))
  const hash = await crypto.subtle.digest('SHA-256', datos)
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `psicofactur-${facturaId}-${hex}`
}

async function llamar(
  ruta: string,
  opciones: RequestInit,
  facturaId?: string,
  cuerpo?: unknown,
): Promise<any> {
  if (!API_KEY) {
    throw new ErrorVerifacti(
      'La facturación electrónica todavía no está configurada. Avisa a quien lleva la aplicación.',
      'falta el secreto VERIFACTI_API_KEY',
      500,
    )
  }

  const cabeceras: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
  if (facturaId && cuerpo !== undefined) {
    cabeceras['Idempotency-Key'] = await claveIdempotencia(facturaId, cuerpo)
  }

  let respuesta: Response
  try {
    respuesta = await fetch(`${API}${ruta}`, { ...opciones, headers: cabeceras })
  } catch (e) {
    // Ni siquiera se llegó a Verifacti: la factura NO se ha registrado
    throw new ErrorVerifacti(
      'No se ha podido conectar con Verifacti. Comprueba la conexión y vuelve a intentarlo.',
      String(e),
      0,
    )
  }

  const texto = await respuesta.text()
  let datos: any = null
  try {
    datos = texto ? JSON.parse(texto) : null
  } catch (_) {
    // Verifacti respondió algo que no es JSON (una pasarela caída, p.ej.)
  }

  if (!respuesta.ok) {
    const detalle = datos?.error ?? texto ?? `HTTP ${respuesta.status}`

    /* 409 = otra petición idéntica se está procesando ahora mismo. No es
       un error de datos: es el doble toque que la idempotencia frena. */
    if (respuesta.status === 409) {
      throw new ErrorVerifacti(
        'Esa factura se está enviando ahora mismo. Espera unos segundos y actualiza la pantalla.',
        String(detalle),
        409,
      )
    }

    throw new ErrorVerifacti(
      mensajeAmable(String(detalle), respuesta.status),
      String(detalle),
      respuesta.status,
    )
  }

  return datos
}

/* ---------------------- Cuerpo de la factura ---------------------- */

/*
 * Una línea exenta NO lleva tipo_impositivo ni cuota_repercutida: sólo
 * la base y el código de exención. Y `operacion_exenta` es excluyente
 * con `calificacion_operacion`, así que en las exentas no se manda esta
 * última (Verifacti asume S1 cuando no hay exención).
 */
function lineasDe(importe: number, exencion?: string | null, tipoImpositivo?: number | null) {
  if (exencion) {
    return [{ base_imponible: importeParaVerifacti(importe), operacion_exenta: exencion }]
  }

  // Sujeta a IVA: el precio de la sesión es lo que paga el paciente, o
  // sea que lleva el IVA dentro y hay que sacarlo hacia atrás.
  const tipo = Number(tipoImpositivo ?? 21)
  const base = Math.round((importe / (1 + tipo / 100)) * 100) / 100
  const cuota = Math.round((importe - base) * 100) / 100

  return [
    {
      base_imponible: importeParaVerifacti(base),
      tipo_impositivo: String(tipo),
      cuota_repercutida: importeParaVerifacti(cuota),
    },
  ]
}

function cuerpoBase(datos: DatosFactura) {
  const { serie, numero } = partirNumeroFactura(datos.numeroFactura)
  const nif = String(datos.destinatario?.nif ?? '').trim().toUpperCase()

  /* Sin DNI no se puede emitir una F1 nominativa, pero la sesión hay que
     facturarla igual: sale como F2 simplificada, que es legal por debajo
     de 400 € y no exige identificar al destinatario. */
  const cuerpo: Record<string, unknown> = {
    serie,
    numero,
    fecha_expedicion: fechaParaVerifacti(datos.fechaEmision),
    tipo_factura: nif ? 'F1' : 'F2',
    descripcion: String(datos.descripcion).slice(0, 500),
    lineas: lineasDe(datos.importe, datos.exencion, datos.tipoImpositivo),
    importe_total: importeParaVerifacti(datos.importe),
  }

  /* La sesión casi nunca es del mismo día en que se factura. La fecha de
     expedición TIENE que ser hoy, así que el día real de la sesión va
     aquí, que es justo para lo que existe este campo. */
  if (datos.fechaOperacion && datos.fechaOperacion !== datos.fechaEmision) {
    cuerpo.fecha_operacion = fechaParaVerifacti(datos.fechaOperacion)
  }

  if (nif) {
    cuerpo.nif = nif
    cuerpo.nombre = String(datos.destinatario?.nombre ?? '').trim()
    if (datos.validarDestinatario === false) cuerpo.validar_destinatario = false
  }

  return cuerpo
}

/* ---------------------- Lo que se usa desde fuera ---------------------- */

/**
 * Crea el registro de facturación de una factura normal.
 *
 * Ojo con lo que significa la respuesta: `estado` vuelve siempre
 * «Pendiente». La AEAT no admite envíos en tiempo real, así que
 * Verifacti encola el registro y lo procesa en un minuto
 * aproximadamente. Que esto no lance no quiere decir que Hacienda lo
 * haya aceptado todavía — para eso está `consultarEstadoFactura`.
 *
 * @param facturaId  id de nuestra fila, sólo para la idempotencia
 */
export async function crearFactura(
  datos: DatosFactura,
  facturaId: string,
): Promise<RespuestaVerifacti> {
  const cuerpo = cuerpoBase(datos)
  return await llamar(
    '/verifactu/create',
    { method: 'POST', body: JSON.stringify(cuerpo) },
    facturaId,
    cuerpo,
  )
}

/**
 * SUBSANA una factura que la AEAT rechazó.
 *
 * No confundir con las otras dos formas de arreglar una factura, que se
 * parecen y no son lo mismo:
 *
 *   · Subsanar (esto)  → Hacienda RECHAZÓ el registro, así que la
 *     factura nunca llegó a constar. Se reenvía con el MISMO número y
 *     los datos corregidos. No se emite ninguna factura nueva porque,
 *     a ojos de la AEAT, aquélla no existe.
 *   · Rectificar       → la factura sí consta, pero tiene un dato mal.
 *     Se emite otra distinta que la corrige.
 *   · Anular           → la factura consta y no debió existir nunca.
 *
 * `rechazo_previo: 'X'` es literalmente «el alta inicial fue
 * rechazada», que es nuestro caso. (Con 'N' se subsana una factura que
 * la AEAT sí aceptó, y con 'S' una subsanación que fue rechazada.)
 *
 * Ojo con dos cosas al guardar la respuesta:
 *   · vuelve un uuid NUEVO, así que hay que reemplazar el que había o
 *     se consultaría eternamente el estado del registro viejo;
 *   · `fecha_expedicion` tiene que seguir siendo la de la factura
 *     original, no la de hoy: se está reenviando aquella factura, no
 *     emitiendo una de hoy.
 */
export async function subsanarFactura(
  datos: DatosFactura,
  facturaId: string,
  rectifica?: Rectificacion,
): Promise<RespuestaVerifacti> {
  const cuerpo = {
    ...cuerpoBase(datos),
    ...(rectifica ? camposRectificativa(rectifica) : {}),
    rechazo_previo: 'X',
  }

  return await llamar(
    '/verifactu/modify',
    { method: 'PUT', body: JSON.stringify(cuerpo) },
    facturaId,
    cuerpo,
  )
}

export interface FacturaOriginal {
  /** «2026/0001», el de la factura que se corrige */
  numeroFactura: string
  /** YYYY-MM-DD */
  fechaEmision: string
  /** Lo que decía la original, para el bloque importe_rectificativa */
  importe: number
  exencion?: string | null
  tipoImpositivo?: number | null
}

/**
 * Crea la factura RECTIFICATIVA de otra.
 *
 * Es la vía correcta para una factura que sí correspondía emitir pero
 * tiene un dato mal. No confundir con `/verifactu/cancel`, que es para
 * facturas que no debieron existir nunca (un duplicado, un error de
 * proceso): aquélla borra el registro, ésta deja el rastro de las dos.
 *
 * Va por SUSTITUCIÓN (`tipo_rectificativa: 'S'`): la factura nueva lleva
 * el importe correcto COMPLETO —60 €, no «-10 €»—, y aparte declara en
 * `importe_rectificativa` lo que decía la original. Se lee como lo que
 * es: la factura que se tendría que haber emitido.
 *
 * El tipo R1 es «Art. 80.1 y 80.2 y error fundado en derecho», que es
 * donde caen los errores en los datos o en el importe.
 */
export interface Rectificacion {
  original: FacturaOriginal
  motivo: string
}

/*
 * Los campos que convierten un cuerpo normal en una rectificativa.
 *
 * Están aparte porque hacen falta en dos sitios: al crearla y al
 * subsanarla si Hacienda la rechaza. Si se quedaran dentro de
 * `crearFacturaRectificativa`, subsanar una rectificativa la reenviaría
 * como si fuera una factura normal —perdiendo el R1 y la referencia a
 * la original— y la AEAT tendría dos registros que no cuadran.
 */
function camposRectificativa({ original, motivo }: Rectificacion) {
  /* Lo que decía la ORIGINAL, no lo que dice ésta. Si la original
     estaba exenta la cuota era cero; si llevaba IVA hay que
     descomponerla igual que se descompuso entonces. */
  const lineaOriginal = lineasDe(
    original.importe,
    original.exencion,
    original.tipoImpositivo,
  )[0] as Record<string, string>

  const { serie, numero } = partirNumeroFactura(original.numeroFactura)

  return {
    tipo_factura: 'R1',
    tipo_rectificativa: 'S',
    descripcion: String(motivo || 'Rectificación de factura').slice(0, 500),
    importe_rectificativa: {
      base_rectificada: lineaOriginal.base_imponible,
      cuota_rectificada: lineaOriginal.cuota_repercutida ?? '0',
    },
    facturas_rectificadas: [
      {
        serie,
        numero,
        fecha_expedicion: fechaParaVerifacti(original.fechaEmision),
      },
    ],
  }
}

export async function crearFacturaRectificativa(
  original: FacturaOriginal,
  datosCorregidos: DatosFactura,
  motivo: string,
  facturaId: string,
): Promise<RespuestaVerifacti> {
  const cuerpo = {
    ...cuerpoBase(datosCorregidos),
    ...camposRectificativa({ original, motivo }),
  }

  return await llamar(
    '/verifactu/create',
    { method: 'POST', body: JSON.stringify(cuerpo) },
    facturaId,
    cuerpo,
  )
}

/* Tal y como responde /verifactu/status. Los nombres son los suyos, no
   los nuestros: `mensaje_error` (no «descripcion»), y `operacion` dice
   si el registro es un «Alta» o una anulación. */
export interface EstadoRegistro {
  nif?: string
  serie?: string
  numero?: string
  fecha_expedicion?: string
  operacion?: string
  /** «Pendiente» mientras la AEAT no lo procesa; luego «Correcta»… */
  estado?: string
  url?: string
  qr?: string
  codigo_error?: string | null
  mensaje_error?: string | null
  estado_registro_duplicado?: string | null
}

/**
 * En qué ha quedado el registro: si la AEAT lo aceptó o lo rechazó.
 *
 * Se consulta por el uuid que devolvió la creación, y tiene sentido
 * llamarla como pronto un minuto después de emitir.
 */
export async function consultarEstadoFactura(uuid: string): Promise<EstadoRegistro> {
  return await llamar(
    `/verifactu/status?uuid=${encodeURIComponent(uuid)}`,
    { method: 'GET' },
  )
}
