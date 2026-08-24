/* ================================================================
   generar-factura

   Emite la factura de una sesión: la registra en la AEAT a través de
   Verifacti y guarda en `facturas` lo que responde.

   La llama el navegador al pulsar «Emitir». Del navegador sólo se
   acepta QUÉ sesión se factura; el importe, el nombre y el DNI se leen
   de la base con el RLS de la usuaria puesto, para que nadie pueda
   fabricar una factura con datos inventados.

   El orden importa y no es casual:

     1) primero se crea la fila en `facturas`, que es quien asigna el
        número por el trigger;
     2) después se envía a Verifacti con ESE número.

   Al revés no puede ser: la numeración tiene que ser correlativa y sin
   huecos, así que el número se reserva antes de salir a la red. La
   consecuencia es que un envío fallido deja la fila creada, con su
   número y marcada con el error, y se reintenta sobre ella. El número
   no se «devuelve»: eso es lo correcto, no un descuido.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteDeUsuaria, psicologaDeLaPeticion } from '../_shared/supabase.ts'
import {
  crearFactura,
  crearFacturaRectificativa,
  ErrorVerifacti,
  hoyEnMadrid,
  subsanarFactura,
  verifactiConfigurado,
  type DatosFactura,
} from '../_shared/verifacti.ts'

const ETIQUETA_TIPO: Record<string, string> = {
  individual: 'Sesión de psicoterapia individual',
  pareja: 'Sesión de terapia de pareja',
  online: 'Sesión de psicoterapia online',
}

/* Lo que la psicóloga tiene que tener relleno antes de poder facturar.
   No lo pide Verifacti —el emisor lo determina la API key— sino la
   factura en sí: son los datos que van impresos en el documento que se
   le entrega al paciente. */
const CAMPOS_FISCALES: Array<{ campo: string; nombre: string }> = [
  { campo: 'nif', nombre: 'el NIF' },
  { campo: 'razon_social', nombre: 'el nombre fiscal' },
  { campo: 'direccion_fiscal', nombre: 'la dirección fiscal' },
]

interface ConfigVerifactu {
  /** 'E1' = art. 20 LIVA, la exención sanitaria. null = sujeta a IVA. */
  exencion?: string | null
  /** Sólo si no está exenta */
  tipoImpositivo?: number | null
  /** En pruebas se pone a false para poder usar DNIs inventados */
  validarDestinatario?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const psicologaId = await psicologaDeLaPeticion(req)
  if (!psicologaId) {
    return json({ mensaje: 'La sesión ha caducado. Vuelve a entrar.' }, 401)
  }

  if (!verifactiConfigurado()) {
    return json(
      {
        mensaje:
          'La facturación electrónica todavía no está configurada. Avisa a quien lleva la aplicación.',
      },
      503,
    )
  }

  let cuerpo: {
    cita_id?: string
    factura_id?: string
    metodo_pago?: string
    /* Rectificar: se recibe el id de la factura ORIGINAL más lo que hay
       que corregir. La fila nueva la crea esta función, no el navegador. */
    rectificar?: { importe?: number; motivo?: string }
  }
  try {
    cuerpo = await req.json()
  } catch (_) {
    return json({ mensaje: 'No se ha recibido qué sesión hay que facturar.' }, 400)
  }

  const {
    cita_id: citaId,
    factura_id: facturaId,
    metodo_pago: metodoPago,
    rectificar,
  } = cuerpo
  if (!citaId && !facturaId) {
    return json({ mensaje: 'No se ha recibido qué sesión hay que facturar.' }, 400)
  }

  const db = clienteDeUsuaria(req)

  /* ---------- 1. Los datos fiscales de la psicóloga ---------- */

  const { data: psicologa, error: errorPsicologa } = await db
    .from('psicologas')
    .select('nif, razon_social, direccion_fiscal, verifactu_config')
    .eq('id', psicologaId)
    .single()

  if (errorPsicologa || !psicologa) {
    return json({ mensaje: 'No se han podido leer tus datos de facturación.' }, 500)
  }

  const faltan = CAMPOS_FISCALES.filter(
    ({ campo }) => !String((psicologa as any)[campo] ?? '').trim(),
  ).map(({ nombre }) => nombre)

  if (faltan.length > 0) {
    /* Se corta ANTES de crear la fila: si se dejara pasar, se gastaría
       un número de factura para acabar fallando de todas formas. La
       pantalla usa `configuracion_incompleta` para llevarla a Ajustes
       en vez de enseñarle un error y dejarla ahí parada. */
    const lista =
      faltan.length === 1
        ? faltan[0]
        : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`

    return json(
      {
        mensaje: `Antes de emitir la primera factura tienes que completar ${lista} en Ajustes.`,
        configuracion_incompleta: true,
        faltan,
      },
      400,
    )
  }

  const config: ConfigVerifactu = (psicologa.verifactu_config ?? {}) as ConfigVerifactu
  // Por defecto exenta por artículo 20: las sesiones de psicoterapia de
  // una psicóloga sanitaria son asistencia sanitaria y no llevan IVA.
  const exencion = config.exencion === undefined ? 'E1' : config.exencion

  /* ---------- 2. La fila de la factura ---------- */

  const COLUMNAS = `
    id, numero_factura, importe, fecha_emision, cita_id, paciente_id,
    verifactu_id, verifactu_estado, tipo_factura, factura_rectificada_id,
    motivo_rectificacion,
    paciente:pacientes!facturas_paciente_id_fkey (id, nombre, dni, precio_sesion),
    cita:citas!facturas_cita_id_fkey (id, fecha_hora, tipo)
  `

  let factura: any = null

  if (facturaId) {
    const { data, error } = await db
      .from('facturas')
      .select(COLUMNAS)
      .eq('id', facturaId)
      .single()
    if (error || !data) {
      return json({ mensaje: 'No se ha encontrado esa factura.' }, 404)
    }
    factura = data
  } else {
    /* ¿Ya había factura de esta sesión? Entonces se reintenta sobre ella.

       Se filtra por 'normal' a propósito: desde que existen las
       rectificativas, una sesión puede tener dos facturas, y sin el
       filtro `maybeSingle()` fallaría al encontrar más de una fila. La
       que interesa aquí es siempre la normal. */
    const { data: existente } = await db
      .from('facturas')
      .select(COLUMNAS)
      .eq('cita_id', citaId)
      .eq('tipo_factura', 'normal')
      .maybeSingle()

    if (existente) {
      factura = existente
    } else {
      const { data: cita, error: errorCita } = await db
        .from('citas')
        .select('id, paciente_id, paciente:pacientes!citas_paciente_id_fkey (precio_sesion)')
        .eq('id', citaId)
        .single()

      if (errorCita || !cita) {
        return json({ mensaje: 'No se ha encontrado esa sesión.' }, 404)
      }

      const { data: nueva, error: errorAlta } = await db
        .from('facturas')
        .insert({
          psicologa_id: psicologaId,
          paciente_id: cita.paciente_id,
          cita_id: cita.id,
          importe: Number((cita as any).paciente?.precio_sesion ?? 0),
          fecha_emision: hoyEnMadrid(),
          estado_pago: metodoPago ? 'pagado' : 'pendiente',
          metodo_pago: metodoPago ?? null,
          // numero_factura lo pone el trigger de la base
        })
        .select(COLUMNAS)
        .single()

      if (errorAlta || !nueva) {
        // 23505 sobre idx_facturas_cita_unica = carrera con otra pestaña
        if ((errorAlta as any)?.code === '23505') {
          return json(
            { mensaje: 'Esa sesión ya tiene factura. Actualiza la pantalla para verla.' },
            409,
          )
        }
        return json({ mensaje: 'No se ha podido crear la factura.' }, 500)
      }
      factura = nueva
    }
  }

  /* ---------- 2 bis. Rectificar ----------

     Rectificar NO es corregir la factura: es emitir OTRA que sustituye
     a la primera. La original se queda donde está, anulada pero
     presente, porque su rastro en Hacienda no se puede borrar.

     No confundir con subsanar (más abajo): allí Hacienda rechazó el
     registro y la factura nunca llegó a constar, así que se reenvía la
     misma. Aquí la factura SÍ consta, y por eso hace falta una nueva. */
  let original: any = null

  if (rectificar) {
    original = factura

    if (original.verifactu_estado !== 'Correcto') {
      /* Rectificar algo que Hacienda no ha aceptado dejaría a la AEAT
         con una rectificativa que apunta a un registro inexistente. */
      return json(
        {
          mensaje:
            original.verifactu_estado === 'Incorrecto'
              ? 'Esa factura la rechazó Hacienda, así que no hay nada que rectificar: pulsa Subsanar para reenviarla corregida.'
              : 'Sólo se pueden rectificar facturas que Hacienda ya haya aceptado. Espera a que se confirme.',
        },
        400,
      )
    }

    const motivo = String(rectificar.motivo ?? '').trim()
    if (!motivo) {
      return json({ mensaje: 'Hay que explicar por qué se rectifica la factura.' }, 400)
    }

    const importeCorregido = Number(rectificar.importe ?? original.importe)
    if (!(importeCorregido > 0)) {
      return json({ mensaje: 'El importe corregido tiene que ser mayor que cero.' }, 400)
    }

    const { data: nueva, error: errorAlta } = await db
      .from('facturas')
      .insert({
        psicologa_id: psicologaId,
        paciente_id: original.paciente_id,
        cita_id: original.cita_id,
        importe: importeCorregido,
        fecha_emision: hoyEnMadrid(),
        estado_pago: 'pendiente',
        tipo_factura: 'rectificativa',
        factura_rectificada_id: original.id,
        motivo_rectificacion: motivo,
        // numero_factura lo pone el trigger, con serie «R»
      })
      .select(COLUMNAS)
      .single()

    if (errorAlta || !nueva) {
      // 23505 = ya existe una rectificativa de esta factura
      if ((errorAlta as any)?.code === '23505') {
        return json(
          {
            mensaje:
              'Esa factura ya estaba rectificada. Actualiza la pantalla; si la rectificativa también está mal, rectifica esa otra.',
          },
          409,
        )
      }
      console.error('[Psicofactur] no se pudo crear la rectificativa:', errorAlta)
      return json({ mensaje: 'No se ha podido crear la factura rectificativa.' }, 500)
    }

    // A partir de aquí se trabaja sobre la NUEVA, que es la que se envía
    factura = nueva
  }

  /* Reintento de una rectificativa que ya existía: hay que recuperar a
     quién rectifica, o se reenviaría como si fuera una factura normal y
     la AEAT se quedaría con dos registros que no cuadran. */
  if (!original && factura.tipo_factura === 'rectificativa' && factura.factura_rectificada_id) {
    const { data, error } = await db
      .from('facturas')
      .select('id, numero_factura, importe, fecha_emision')
      .eq('id', factura.factura_rectificada_id)
      .single()

    if (error || !data) {
      return json({ mensaje: 'No se ha encontrado la factura que ésta rectifica.' }, 404)
    }
    original = data
  }

  /* Ya se envió una vez. Hay dos desenlaces muy distintos:

     · Hacienda la RECHAZÓ ('Incorrecto'). Entonces el registro no
       existe para la AEAT, y lo que toca es reenviarlo con el mismo
       número y los datos ya corregidos: eso es subsanar. No se emite
       una factura nueva ni se gasta otro número.
     · Cualquier otro caso: está en cola o aceptada. No se toca. */
  const subsanando = factura.verifactu_estado === 'Incorrecto'

  if (factura.verifactu_id && !subsanando) {
    return json({
      ya_emitida: true,
      factura_id: factura.id,
      numero_factura: factura.numero_factura,
      verifactu_id: factura.verifactu_id,
      estado: factura.verifactu_estado,
    })
  }

  /* Una factura de cero euros no es una factura. Pasa de verdad: los
     pacientes que entraron importados de Google Calendar vienen con
     `precio_sesion` a 0 hasta que se les pone precio a mano, y sin este
     corte se registraría en Hacienda un alta de 0,00 € que después hay
     que rectificar. Se avisa señalando dónde se arregla. */
  if (!(Number(factura.importe) > 0)) {
    return json(
      {
        mensaje: `${factura.paciente?.nombre ?? 'Este paciente'} no tiene precio por sesión, así que la factura saldría de 0 €. Ponle el precio en su ficha y vuelve a intentarlo.`,
        importe_invalido: true,
        factura_id: factura.id,
        paciente_id: factura.paciente_id,
      },
      400,
    )
  }

  /* ---------- 3. Coherencia de la fecha ---------- */

  /* Verifacti exige que `fecha_expedicion` sea la del día. Si la fila se
     creó otro día y se emite hoy, la factura se expide HOY: se mueve la
     fecha para que el papel y el registro de la AEAT digan lo mismo.

     Al subsanar NO se toca: se está reenviando aquella factura, con su
     fecha, no emitiendo una nueva. Si se moviera, la AEAT no reconocería
     el registro que se quiere corregir. */
  const hoy = hoyEnMadrid()
  if (!subsanando && factura.fecha_emision !== hoy) {
    const anoDelNumero = String(factura.numero_factura ?? '').match(/(\d{4})\//)?.[1]
    if (anoDelNumero && anoDelNumero !== hoy.slice(0, 4)) {
      /* Cambió el año: mover la fecha pondría un número de la serie del
         año pasado en una factura de éste, y la numeración se reinicia
         cada 1 de enero. Esto lo tiene que ver una persona. */
      return json(
        {
          mensaje:
            'Esta factura se creó el año pasado y no se llegó a enviar. Anúlala y crea una nueva con la fecha de hoy.',
        },
        400,
      )
    }

    const { error } = await db
      .from('facturas')
      .update({ fecha_emision: hoy })
      .eq('id', factura.id)
    if (!error) factura.fecha_emision = hoy
  }

  /* ---------- 4. A Verifacti ---------- */

  const sesion = factura.cita?.fecha_hora ? new Date(factura.cita.fecha_hora) : null
  const fechaSesion = sesion
    ? sesion.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    : null

  const etiqueta = ETIQUETA_TIPO[factura.cita?.tipo] ?? 'Sesión de psicoterapia'
  const descripcion = fechaSesion
    ? `${etiqueta} del ${fechaSesion.split('-').reverse().join('/')}`
    : etiqueta

  const datos: DatosFactura = {
    numeroFactura: factura.numero_factura,
    fechaEmision: factura.fecha_emision,
    fechaOperacion: fechaSesion,
    descripcion,
    importe: Number(factura.importe ?? 0),
    destinatario: {
      nif: factura.paciente?.dni ?? null,
      nombre: factura.paciente?.nombre ?? null,
    },
    exencion,
    tipoImpositivo: config.tipoImpositivo ?? null,
    validarDestinatario: config.validarDestinatario,
  }

  /* Lo que hace falta para que la AEAT sepa a qué factura sustituye
     ésta. El tipo de exención se toma de la configuración actual: si
     algún día cambiara, la base de la original se descompondría con el
     criterio de hoy y no con el de entonces. */
  const rectifica = original
    ? {
        original: {
          numeroFactura: original.numero_factura,
          fechaEmision: original.fecha_emision,
          importe: Number(original.importe ?? 0),
          exencion,
          tipoImpositivo: config.tipoImpositivo ?? null,
        },
        motivo: String(factura.motivo_rectificacion ?? 'Rectificación de factura'),
      }
    : undefined

  try {
    let respuesta
    if (subsanando) {
      // Puede ser una rectificativa rechazada: se reenvía COMO rectificativa
      respuesta = await subsanarFactura(datos, factura.id, rectifica)
    } else if (rectifica) {
      respuesta = await crearFacturaRectificativa(
        rectifica.original,
        datos,
        rectifica.motivo,
        factura.id,
      )
    } else {
      respuesta = await crearFactura(datos, factura.id)
    }

    const { data: actualizada, error: errorGuardar } = await db
      .from('facturas')
      .update({
        verifactu_id: respuesta.uuid,
        verifactu_qr_url: respuesta.url,
        verifactu_hash: respuesta.huella,
        verifactu_estado: respuesta.estado ?? 'Pendiente',
        verifactu_error: null,
        verifactu_enviada_at: new Date().toISOString(),
        ...(metodoPago ? { metodo_pago: metodoPago, estado_pago: 'pagado' } : {}),
      })
      .eq('id', factura.id)
      .select('id, numero_factura, importe, fecha_emision, estado_pago, verifactu_estado')
      .single()

    if (errorGuardar) {
      /* Se registró en la AEAT pero no se pudo apuntar aquí. Es el caso
         feo: NO se puede reintentar el envío a ciegas o se duplicaría el
         registro, así que se dice con el uuid delante para poder atarlo
         a mano. */
      console.error('[Psicofactur] factura registrada pero no guardada:', errorGuardar)
      return json(
        {
          mensaje:
            'La factura se ha registrado en Hacienda, pero no se ha podido guardar aquí. Actualiza la pantalla antes de volver a intentarlo.',
          verifactu_id: respuesta.uuid,
        },
        500,
      )
    }

    /* La original se anula SÓLO cuando la rectificativa ya está
       registrada. Al revés quedaría una factura anulada sin nada que la
       sustituya, que es peor que no haber empezado. No se borra: su
       rastro en Hacienda no se puede quitar. */
    if (rectificar && original) {
      const { error: errorAnular } = await db
        .from('facturas')
        .update({ estado_pago: 'anulada' })
        .eq('id', original.id)

      if (errorAnular) {
        console.error('[Psicofactur] rectificativa emitida pero original sin anular:', errorAnular)
      }
    }

    return json({
      factura_id: factura.id,
      numero_factura: actualizada.numero_factura,
      importe: Number(actualizada.importe),
      estado: actualizada.verifactu_estado,
      subsanada: subsanando,
      rectificada: Boolean(rectificar),
      factura_rectificada_id: rectificar && original ? original.id : null,
      verifactu_id: respuesta.uuid,
      qr_url: respuesta.url,
      // El QR ya pintado (PNG en base64). No se guarda en la base: para
      // volver a dibujarlo basta con `qr_url`.
      qr: respuesta.qr,
      huella: respuesta.huella,
    })
  } catch (e) {
    const fallo = e instanceof ErrorVerifacti ? e : null
    console.error('[Psicofactur] Verifacti rechazó la factura:', fallo?.tecnico ?? e)

    // Queda escrito en la fila: así la pantalla puede enseñar «falló, y
    // por qué» en vez de un botón que parece que no hace nada
    await db
      .from('facturas')
      .update({
        verifactu_estado: 'error',
        verifactu_error: fallo?.tecnico ?? String(e),
      })
      .eq('id', factura.id)

    return json(
      {
        mensaje: fallo?.mensaje ?? 'No se ha podido emitir la factura. Inténtalo de nuevo.',
        factura_id: factura.id,
        numero_factura: factura.numero_factura,
      },
      fallo?.estadoHttp && fallo.estadoHttp >= 400 && fallo.estadoHttp < 500 ? 400 : 502,
    )
  }
})
