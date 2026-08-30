import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo, psicologaActualId } from './base'
import { aClave, hoy } from '../lib/fechas'

/* ================================================================
   FACTURAS — tabla `facturas`

   Una factura por sesión: la base lo impone con el índice único
   `idx_facturas_cita_unica`, así que una misma cita no se puede
   facturar dos veces.

   El `numero_factura` NO se pone aquí, y NO se pone al crear la fila: lo
   asigna el trigger `asignar_numero_factura()` cuando la factura se
   EMITE (`emitida_at` deja de ser null), leyendo el contador por
   psicóloga, año y serie (migración 0029). Un borrador no tiene número;
   así la numeración es correlativa, sin huecos y en orden de emisión,
   como exige el RD 1619/2012.

   Crear la fila NO es emitir la factura. Esto sólo la apunta en casa;
   emitirla la cierra (`emitida_at`) y, si Veri*Factu está activo, la
   registra en la AEAT (`services/verifacti.js` + Edge Function).
   ================================================================ */

const COLUMNAS = `
  id, numero_factura, importe, fecha_emision, estado_pago, fecha_pago,
  paciente_id, cita_id, metodo_pago, tipo_factura, factura_rectificada_id,
  motivo_rectificacion, concepto,
  base_imponible, tipo_igic, cuota_igic, tipo_irpf, cuota_irpf, total_factura, liquido,
  destinatario_nif, destinatario_nombre, destinatario_domicilio,
  verifactu_id, verifactu_estado, verifactu_error, verifactu_qr_url, verifactu_hash,
  emitida_at, email_enviado_at, email_destinatario,
  paciente:pacientes (id, nombre, dni, correo, tipo_cliente, empresa_razon_social, empresa_cif, empresa_domicilio),
  cita:citas (id, fecha_hora, tipo),
  rectificada:facturas!factura_rectificada_id (numero_factura)
`

/* `facturas` se referencia a sí misma, y para eso PostgREST quiere como
   pista el nombre de la COLUMNA (`factura_rectificada_id`), no el de la
   clave ajena. Con el nombre del FK responde PGRST200 y se cae la
   consulta entera —no sólo el embed—, que es como se quedó la pantalla
   de facturación en blanco.

   El resultado se lee tolerando las dos formas: PostgREST devuelve un
   objeto cuando resuelve la relación como «muchos a uno», pero según
   cómo interprete la autorreferencia podría devolver una lista de un
   elemento. */
function numeroDeLaRectificada(fila) {
  const r = Array.isArray(fila.rectificada) ? fila.rectificada[0] : fila.rectificada
  return r?.numero_factura ?? null
}

function deFila(fila) {
  const sesion = fila.cita?.fecha_hora ? new Date(fila.cita.fecha_hora) : null
  return {
    id: fila.id,
    // El número nace al emitir (trigger `asignar_numero_factura`, migración
    // 0029). Un borrador todavía no lo tiene.
    numero: fila.numero_factura ?? 'Borrador',
    pacienteId: fila.paciente_id,
    pacienteNombre: fila.paciente?.nombre ?? 'Paciente',
    // Hace falta para el PDF: sin DNI la factura salió simplificada
    pacienteDni: fila.paciente?.dni ?? null,
    // A dónde se le manda la factura. Vacío = no tiene correo en su ficha
    pacienteCorreo: fila.paciente?.correo ?? '',
    citaId: fila.cita_id,
    fechaSesion: sesion ? aClave(sesion) : null,
    horaSesion: sesion
      ? `${String(sesion.getHours()).padStart(2, '0')}:${String(sesion.getMinutes()).padStart(2, '0')}`
      : null,
    tipoSesion: fila.cita?.tipo ?? null,
    /* `importe` = lo que cobra de verdad la consulta = líquido (base +
       IGIC − IRPF). En las facturas de siempre —sesión exenta a un
       particular— coincide con la base. Para la AEAT se usa `total`
       (base + IGIC); el IRPF no viaja allí. */
    importe: Number(fila.liquido ?? fila.importe ?? 0),

    /* Desglose (migración 0024). En las facturas de siempre —sesión
       exenta a un particular— base == total == liquido == importe, y
       IGIC/IRPF son cero. Las de empresa o las manuales lo usan de verdad. */
    concepto: fila.concepto ?? null,
    base: Number(fila.base_imponible ?? fila.importe ?? 0),
    tipoIgic: Number(fila.tipo_igic ?? 0),
    cuotaIgic: Number(fila.cuota_igic ?? 0),
    tipoIrpf: Number(fila.tipo_irpf ?? 0),
    cuotaIrpf: Number(fila.cuota_irpf ?? 0),
    total: Number(fila.total_factura ?? fila.importe ?? 0),
    liquido: Number(fila.liquido ?? fila.importe ?? 0),
    // Manual = creada con `crearFacturaManual`, que siempre pone concepto.
    // No basta con `cita_id is null`: alguna factura importada tampoco
    // tiene cita y no es una factura manual.
    esManual: Boolean(fila.concepto),
    esEmpresa: (fila.paciente?.tipo_cliente ?? 'particular') === 'empresa',
    empresaRazonSocial: fila.paciente?.empresa_razon_social ?? '',
    empresaCif: fila.paciente?.empresa_cif ?? '',
    empresaDomicilio: fila.paciente?.empresa_domicilio ?? '',
    // Copia del destinatario tal como estaba al emitir (null si aún borrador)
    destinatarioNif: fila.destinatario_nif ?? null,
    destinatarioNombre: fila.destinatario_nombre ?? null,
    destinatarioDomicilio: fila.destinatario_domicilio ?? null,

    fechaEmision: fila.fecha_emision,
    // 'YYYY-MM' de emisión y de la sesión. La pantalla agrupa y filtra
    // por el de la SESIÓN (cuándo se prestó el servicio); si la cita ya
    // no está, se cae al de emisión para no perder la factura.
    mes: fila.fecha_emision.slice(0, 7),
    mesSesion: (fila.cita?.fecha_hora ? aClave(sesion) : fila.fecha_emision).slice(0, 7),
    estado: fila.estado_pago,
    fechaPago: fila.fecha_pago,
    metodoPago: fila.metodo_pago,
    tipo: fila.tipo_factura ?? 'normal',
    rectificaA: fila.factura_rectificada_id,
    numeroRectificada: numeroDeLaRectificada(fila),
    motivoRectificacion: fila.motivo_rectificacion,

    /* Estado ante Hacienda. Son situaciones muy distintas y la pantalla
       las pinta distinto:
         · null         → existe aquí, la AEAT no la conoce
         · 'error'      → ni se llegó a enviar; se reintenta y ya está
         · 'Pendiente'  → enviada y encolada, la AEAT tarda ~1 minuto
         · 'Correcto'   → aceptada
         · 'Incorrecto' → la AEAT la RECHAZÓ. Ojo: esto llega después de
                          decir que sí, así que sin consultar el estado
                          no se nota. Ver `sincronizarEstadoFacturas`. */
    /* Cuándo y a qué dirección se le mandó al paciente. La dirección se
       guarda tal como estaba ese día: si luego cambia su correo en la
       ficha, esto tiene que seguir diciendo adónde fue de verdad. */
    emailEnviadoEn: fila.email_enviado_at,
    emailDestinatario: fila.email_destinatario ?? '',

    /* «Emitida» = ya no es un borrador. Con Veri*Factu activo se deduce
       de `verifactu_id`; con Veri*Factu apagado, de `emitida_at`, que
       pone `emitirFacturaLocal`. Cualquiera de las dos vale. */
    emitida: Boolean(fila.verifactu_id) || Boolean(fila.emitida_at),
    emitidaAt: fila.emitida_at ?? null,
    verifactuId: fila.verifactu_id,
    verifactuEstado: fila.verifactu_estado,
    verifactuError: fila.verifactu_error,
    qrUrl: fila.verifactu_qr_url,
    huella: fila.verifactu_hash,
  }
}

/* PostgREST corta cada respuesta en 1000 filas (el `max-rows` de
   Supabase). Sin paginar, en cuanto la consulta pasó de mil facturas
   dejaban de llegar las más antiguas: como se ordena por fecha de
   emisión, «desaparecía» de la pantalla un mes entero de golpe. */
const TAMANO_PAGINA = 1000

/** Todas las facturas, de la más reciente a la más antigua */
export async function getFacturas() {
  const filas = []
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await ejecutar(
      supabase
        .from('facturas')
        .select(COLUMNAS)
        .order('fecha_emision', { ascending: false })
        .order('numero_factura', { ascending: false })
        .range(desde, desde + TAMANO_PAGINA - 1),
      'cargar las facturas',
    )
    if (error) return { data: null, error }
    filas.push(...data)
    if (data.length < TAMANO_PAGINA) break
  }
  return exito(filas.map(deFila))
}

export async function getFacturasDePaciente(pacienteId) {
  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .select(COLUMNAS)
      .eq('paciente_id', pacienteId)
      .order('fecha_emision', { ascending: false }),
    'cargar las facturas del paciente',
  )
  if (error) return { data: null, error }
  return exito(data.map(deFila))
}

/**
 * Sesiones ya celebradas que todavía no tienen factura.
 * Es lo que cuenta el botón «Facturar» de cada paciente.
 * Las citas canceladas no se facturan.
 */
export async function getSesionesSinFacturar() {
  // Hasta el final del día de hoy: una sesión de esta tarde ya se puede
  // facturar por la mañana, pero las de mañana en adelante no.
  const finDeHoy = new Date()
  finDeHoy.setHours(23, 59, 59, 999)

  const { data, error } = await ejecutar(
    supabase
      .from('citas')
      .select(
        `id, fecha_hora, tipo, paciente_id,
         paciente:pacientes!citas_paciente_id_fkey (id, nombre, precio_sesion),
         factura:facturas!facturas_cita_id_fkey (id)`,
      )
      .lte('fecha_hora', finDeHoy.toISOString())
      .neq('estado_confirmacion', 'cancelada')
      .is('factura', null)
      .order('fecha_hora'),
    'buscar las sesiones sin facturar',
  )
  if (error) return { data: null, error }

  return exito(
    data.map((c) => {
      const f = new Date(c.fecha_hora)
      return {
        citaId: c.id,
        pacienteId: c.paciente_id,
        pacienteNombre: c.paciente?.nombre ?? 'Paciente',
        precioSesion: Number(c.paciente?.precio_sesion ?? 0),
        fecha: aClave(f),
        hora: `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`,
        tipo: c.tipo,
      }
    }),
  )
}

/**
 * Emite la factura de UNA sesión.
 * En las sesiones de pareja se factura al paciente titular.
 */
export async function facturarSesion(sesion) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(new Error('sin sesión'), 'generar la factura: la sesión ha caducado')
  }

  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .insert({
        psicologa_id: psicologaId,
        paciente_id: sesion.pacienteId,
        cita_id: sesion.citaId,
        importe: sesion.precioSesion,
        fecha_emision: aClave(hoy()),
        estado_pago: 'pendiente',
        // numero_factura lo pone el trigger de la base de datos
      })
      .select(COLUMNAS)
      .single(),
    'generar la factura',
  )

  if (error) {
    // 23505 sobre idx_facturas_cita_unica = esa sesión ya estaba facturada
    if (error.tecnico?.code === '23505') {
      return {
        data: null,
        error: {
          mensaje: 'Esa sesión ya tiene factura. Actualiza la pantalla para verla.',
          tecnico: error.tecnico,
        },
      }
    }
    return { data: null, error }
  }
  return exito(deFila(data))
}

const REDONDEO = (n) => Math.round(Number(n || 0) * 100) / 100

/**
 * Crea una factura que NO sale de una cita: talleres, formación, un
 * servicio suelto a una empresa. Se elige la ficha (el destinatario), el
 * concepto, la base y los tipos de IGIC e IRPF.
 *
 * Nace como BORRADOR, igual que las de sesión: registrarla en Hacienda
 * es un paso aparte. El desglose (cuotas) se calcula aquí; `total_factura`
 * y `liquido` los calcula sola la base de datos.
 *
 * @param {{pacienteId, concepto, baseImponible, tipoIgic?, tipoIrpf?}} datos
 */
export async function crearFacturaManual({
  pacienteId,
  concepto,
  baseImponible,
  tipoIgic = 0,
  tipoIrpf = 0,
}) {
  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(new Error('sin sesión'), 'crear la factura: la sesión ha caducado')
  }

  const base = REDONDEO(baseImponible)
  if (!(base > 0)) {
    return fallo(new Error('base'), 'crear la factura', 'La base imponible tiene que ser mayor que cero.')
  }
  if (!String(concepto ?? '').trim()) {
    return fallo(new Error('concepto'), 'crear la factura', 'Hay que poner un concepto.')
  }
  if (!pacienteId) {
    return fallo(new Error('sin ficha'), 'crear la factura', 'Hay que elegir a quién se factura.')
  }

  const igic = Number(tipoIgic) || 0
  const irpf = Number(tipoIrpf) || 0
  const cuotaIgic = REDONDEO((base * igic) / 100)
  const cuotaIrpf = REDONDEO((base * irpf) / 100)

  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .insert({
        psicologa_id: psicologaId,
        paciente_id: pacienteId,
        cita_id: null,
        concepto: String(concepto).trim(),
        base_imponible: base,
        tipo_igic: igic,
        cuota_igic: cuotaIgic,
        tipo_irpf: irpf,
        cuota_irpf: cuotaIrpf,
        // `importe` = líquido: base + IGIC − IRPF, que es lo que cobra
        // de verdad la consulta. total_factura (para la AEAT) lo calcula
        // sola la base.
        importe: REDONDEO(base + cuotaIgic - cuotaIrpf),
        fecha_emision: aClave(hoy()),
        estado_pago: 'pendiente',
        // numero_factura lo pone el trigger de la base de datos
      })
      .select(COLUMNAS)
      .single(),
    'crear la factura',
  )

  if (error) return { data: null, error }
  return exito(deFila(data))
}

/**
 * Crea la fila (borrador) de TODAS las sesiones celebradas que aún no
 * tienen factura. Es lo que hacía a mano el botón «Generar factura»,
 * ahora automático: la pantalla de Facturación lo llama al abrirse como
 * red de seguridad por si el cron `facturar_citas_pasadas` todavía no
 * ha pasado por una sesión recién terminada.
 *
 * Devuelve sólo las que ha creado. Si una sesión se colara ya facturada
 * (el cron se adelantó), `facturarSesion` da error de duplicado y se
 * ignora sin más.
 */
export async function facturarSesionesPendientes() {
  const { data: sesiones, error } = await getSesionesSinFacturar()
  if (error) return { data: null, error }
  if (sesiones.length === 0) return exito([])

  const creadas = []
  for (const sesion of sesiones) {
    const { data } = await facturarSesion(sesion)
    if (data) creadas.push(data)
  }
  return exito(creadas)
}

/* ================================================================
   EMITIR EN LOCAL — cuando `psicologas.verifactu_activo` es false

   «Emitir» no llama a ninguna Edge Function ni a la AEAT: sólo cierra
   la factura aquí. Le fija la fecha del día y le pone `emitida_at`. A
   partir de ahí se puede descargar y mandar, y ya no se edita: se
   rectifica.

   Repite las comprobaciones de la Edge Function `generar-factura` que
   siguen teniendo sentido sin red: el corte de 0 € y el aviso de la
   factura que se quedó de otro año (mover su fecha metería un número de
   la serie del año pasado en una factura de éste).
   ================================================================ */
export async function emitirFacturaLocal(facturaId) {
  if (!facturaId) {
    return fallo(new Error('sin factura'), 'emitir la factura', 'No se sabe qué factura emitir.')
  }

  const { data: factura, error } = await ejecutar(
    supabase.from('facturas').select(COLUMNAS).eq('id', facturaId).single(),
    'emitir la factura',
  )
  if (error) return { data: null, error }

  // Ya cerrada: no se toca nada, se devuelve tal cual (idempotente)
  if (factura.emitida_at) return exito(deFila(factura))

  // Ésta va por el camino de Verifacti, no por aquí
  if (factura.verifactu_id) {
    return fallo(
      new Error('verifactu'),
      'emitir la factura',
      'Esta factura ya está registrada en Hacienda.',
    )
  }

  const total = Number(factura.total_factura ?? factura.importe ?? 0)
  if (!(total > 0)) {
    return fallo(
      new Error('importe cero'),
      'emitir la factura',
      `${factura.paciente?.nombre ?? 'Este paciente'} no tiene precio por sesión, así que la factura saldría de 0 €. Ponle el precio en su ficha y vuelve a intentarlo.`,
    )
  }

  const hoyClave = aClave(hoy())
  /* El número nace al emitir (migración 0029), así que un borrador no
     trae número que comprobar. Esto solo salta al reemitir algo que ya
     tenía número de un año anterior. */
  const anoDelNumero = factura.numero_factura
    ? String(factura.numero_factura).match(/(\d{4})\//)?.[1]
    : null
  if (anoDelNumero && anoDelNumero !== hoyClave.slice(0, 4)) {
    return fallo(
      new Error('otro año'),
      'emitir la factura',
      'Esta factura se creó otro año y no se llegó a emitir. Anúlala y crea una nueva con la fecha de hoy.',
    )
  }

  const cambios = { emitida_at: new Date().toISOString() }
  if (factura.fecha_emision !== hoyClave) cambios.fecha_emision = hoyClave

  const { data, error: errorGuardar } = await ejecutar(
    supabase
      .from('facturas')
      .update(cambios)
      .eq('id', facturaId)
      .is('emitida_at', null)
      .is('verifactu_id', null)
      .select(COLUMNAS)
      .single(),
    'emitir la factura',
  )
  if (errorGuardar) {
    // PGRST116 = el update no tocó ninguna fila: otra pestaña la emitió
    if (errorGuardar.tecnico?.code === 'PGRST116') {
      return fallo(
        new Error('carrera'),
        'emitir la factura',
        'Esta factura ya se ha emitido. Actualiza la pantalla.',
      )
    }
    return { data: null, error: errorGuardar }
  }
  return exito(deFila(data))
}

/**
 * Rectifica una factura SIN Veri*Factu: crea otra en serie «R» que la
 * sustituye y deja la original anulada. Mismo criterio legal que la
 * rectificativa que va a la AEAT (ver la Edge Function `generar-factura`),
 * sólo que aquí todo ocurre en la base.
 *
 * @param {{facturaId: string, importe: number, motivo: string}} datos
 */
export async function rectificarFacturaLocal({ facturaId, importe, motivo } = {}) {
  if (!facturaId) {
    return fallo(new Error('sin factura'), 'rectificar la factura', 'No se sabe qué factura rectificar.')
  }
  const motivoLimpio = String(motivo ?? '').trim()
  if (!motivoLimpio) {
    return fallo(
      new Error('sin motivo'),
      'rectificar la factura',
      'Hay que explicar por qué se rectifica la factura.',
    )
  }
  const importeCorregido = Number(importe)
  if (!(importeCorregido > 0)) {
    return fallo(
      new Error('importe'),
      'rectificar la factura',
      'El importe corregido tiene que ser mayor que cero.',
    )
  }

  const psicologaId = await psicologaActualId()
  if (!psicologaId) {
    return fallo(new Error('sin sesión'), 'rectificar la factura: la sesión ha caducado')
  }

  const { data: original, error: errorOrig } = await ejecutar(
    supabase.from('facturas').select(COLUMNAS).eq('id', facturaId).single(),
    'rectificar la factura',
  )
  if (errorOrig) return { data: null, error: errorOrig }

  if (!original.emitida_at && !original.verifactu_id) {
    return fallo(
      new Error('no emitida'),
      'rectificar la factura',
      'Sólo se rectifican facturas ya emitidas. Si todavía es un borrador, edítala.',
    )
  }

  const { data: nueva, error: errorAlta } = await ejecutar(
    supabase
      .from('facturas')
      .insert({
        psicologa_id: psicologaId,
        paciente_id: original.paciente_id,
        cita_id: original.cita_id,
        importe: importeCorregido,
        fecha_emision: aClave(hoy()),
        estado_pago: 'pendiente',
        tipo_factura: 'rectificativa',
        factura_rectificada_id: original.id,
        motivo_rectificacion: motivoLimpio,
        emitida_at: new Date().toISOString(),
        // numero_factura lo pone el trigger, con serie «R»
      })
      .select(COLUMNAS)
      .single(),
    'rectificar la factura',
  )

  if (errorAlta) {
    // 23505 sobre idx_facturas_una_rectificativa_por_original
    if (errorAlta.tecnico?.code === '23505') {
      return fallo(
        new Error('ya rectificada'),
        'rectificar la factura',
        'Esa factura ya estaba rectificada. Actualiza la pantalla; si la rectificativa también está mal, rectifica esa otra.',
      )
    }
    return { data: null, error: errorAlta }
  }

  /* La original se anula SÓLO cuando la rectificativa ya existe: al revés
     quedaría una factura anulada sin nada que la sustituya. */
  const { error: errorAnular } = await ejecutar(
    supabase.from('facturas').update({ estado_pago: 'anulada' }).eq('id', original.id),
    'anular la factura original',
  )
  if (errorAnular) {
    console.error('[Psicofactur] rectificativa creada pero original sin anular:', errorAnular)
  }

  return exito(deFila(nueva))
}

/**
 * Forma de cobro de la factura: efectivo, tarjeta… Es un dato de
 * contabilidad y se puede cambiar cuando se quiera; no viaja a la AEAT
 * (el registro de facturación no recoge la forma de pago).
 */
export async function cambiarMetodoPago(id, metodo) {
  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .update({ metodo_pago: metodo || null })
      .eq('id', id)
      .select(COLUMNAS)
      .single(),
    'cambiar el método de pago',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}

/**
 * Retoca una factura que todavía es un BORRADOR (aún no registrada en
 * Hacienda). La fecha de emisión no se toca porque la Edge Function la
 * pone al día de hoy al emitir.
 *
 *  · Sesión a un particular → sólo `importe` (base = total = líquido).
 *  · Empresa o factura manual → `base` + tipos de IGIC e IRPF; las
 *    cuotas y el líquido se recalculan aquí.
 *
 * El `.is('verifactu_id', null)` es el cierre de seguridad: si la
 * factura ya se hubiera emitido, el update no toca ninguna fila y se
 * devuelve un aviso claro en vez de dejar pasar el cambio. Una vez
 * emitida, lo que toca es `rectificarFactura`.
 */
export async function editarBorradorFactura(id, { importe, base, tipoIgic, tipoIrpf } = {}) {
  let cambios

  if (base !== undefined || tipoIgic !== undefined || tipoIrpf !== undefined) {
    const b = REDONDEO(base)
    if (!(b > 0)) {
      return fallo(new Error('base'), 'editar la factura', 'La base tiene que ser mayor que cero.')
    }
    const igic = Number(tipoIgic) || 0
    const irpf = Number(tipoIrpf) || 0
    const cuotaIgic = REDONDEO((b * igic) / 100)
    const cuotaIrpf = REDONDEO((b * irpf) / 100)
    cambios = {
      base_imponible: b,
      tipo_igic: igic,
      cuota_igic: cuotaIgic,
      tipo_irpf: irpf,
      cuota_irpf: cuotaIrpf,
      importe: REDONDEO(b + cuotaIgic - cuotaIrpf), // líquido
    }
  } else {
    const valor = Number(importe)
    if (!(valor > 0)) {
      return fallo(
        new Error('importe no válido'),
        'editar la factura',
        'El importe tiene que ser un número mayor que cero.',
      )
    }
    cambios = { importe: valor }
  }

  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .update(cambios)
      .eq('id', id)
      .is('verifactu_id', null)
      .is('emitida_at', null)
      .select(COLUMNAS)
      .single(),
    'editar la factura',
  )

  if (error) {
    // PGRST116 = el update no encontró fila: la factura ya se había emitido
    if (error.tecnico?.code === 'PGRST116') {
      return {
        data: null,
        error: {
          mensaje:
            'Esta factura ya está emitida y no se puede editar. Actualiza la pantalla: si tiene un dato mal, se rectifica.',
          tecnico: error.tecnico,
        },
      }
    }
    return { data: null, error }
  }
  return exito(deFila(data))
}

/** Pendiente ↔ Pagado, o anulada */
export async function cambiarEstadoPago(id, estado) {
  const { data, error } = await ejecutar(
    supabase
      .from('facturas')
      .update({
        estado_pago: estado,
        fecha_pago: estado === 'pagado' ? aClave(hoy()) : null,
      })
      .eq('id', id)
      .select(COLUMNAS)
      .single(),
    'cambiar el estado de la factura',
  )
  if (error) return { data: null, error }
  return exito(deFila(data))
}
