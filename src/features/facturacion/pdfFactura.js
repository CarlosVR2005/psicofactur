import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

/* ================================================================
   EL PDF DE LA FACTURA

   Verifacti no genera el documento: registra la factura ante la AEAT y
   devuelve el QR, la huella y el identificador. El papel que se le
   entrega al paciente lo hacemos nosotros, y tiene que cumplir dos
   cosas a la vez:

   1) Lo de siempre para una factura completa (art. 6 del RD 1619/2012):
      número y serie, fecha, datos del emisor y del destinatario,
      descripción de la operación, base, tipo o mención de la exención,
      y total.

   2) Lo que añade Veri*Factu (RD 1007/2023 y Orden HAC/1177/2024):

      · el código QR con la URL de cotejo de la AEAT,
      · entre 30x30 y 40x40 mm, con corrección de errores nivel M,
      · **al principio** de la factura, cerca del margen superior y
        preferiblemente centrado en las verticales,
      · y la frase «VERI*FACTU» —o «Factura verificable en la sede
        electrónica de la AEAT»— «con un tipo de letra y tamaño bien
        visibles».

   Esas medidas y esa posición no son una elección de diseño: vienen
   dictadas. Por eso están escritas como constantes y no repartidas por
   el código.
   ================================================================ */

const MARGEN = 20 // mm
const ANCHO_PAGINA = 210 // A4 vertical
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2

/* La norma admite de 30 a 40 mm. Se toma 35 para quedar holgadamente
   dentro por los dos lados aunque la impresora escale un poco. */
const QR_MM = 35

const LEYENDA_VERIFACTU = 'VERI*FACTU'
const LEYENDA_VERIFACTU_LARGA = 'Factura verificable en la sede electrónica de la AEAT'

/* La mención de la exención es obligatoria: el art. 6.1.j del RD
   1619/2012 exige indicar el precepto que la ampara. Sin esto, la
   factura está incompleta aunque el importe cuadre. */
const MENCION_EXENCION = {
  E1: 'Operación exenta de IVA según el artículo 20.Uno.3º de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido (asistencia sanitaria).',
  E2: 'Operación exenta de IVA según el artículo 21 de la Ley 37/1992.',
  E3: 'Operación exenta de IVA según el artículo 22 de la Ley 37/1992.',
  E4: 'Operación exenta de IVA según los artículos 23 y 24 de la Ley 37/1992.',
  E5: 'Operación exenta de IVA según el artículo 25 de la Ley 37/1992.',
  E6: 'Operación exenta de IVA según la Ley 37/1992.',
}

/* En Canarias la exención sanitaria es del IGIC, no del IVA. El
   precepto exacto lo tiene que confirmar el gestor de la consulta; se
   nombra la ley. */
const MENCION_EXENCION_IGIC = {
  E1: 'Operación exenta de IGIC (asistencia sanitaria) conforme a la Ley 20/1991, de 7 de junio, de modificación de los aspectos fiscales del Régimen Económico Fiscal de Canarias.',
  DEFECTO: 'Operación exenta de IGIC conforme a la Ley 20/1991, de 7 de junio.',
}

/* El hueco del logo. El QR mide 35 mm centrado en una página de 210,
   así que empieza en x = 87,5. Con el margen de 20, quedan 67,5 mm
   hasta él; nos quedamos en 50 para dejar un pasillo visible. */
const LOGO_ANCHO_MAX = 50
const LOGO_ALTO_MAX = 25

/**
 * Pinta el logo dentro de su hueco, sin deformarlo y centrado en
 * vertical respecto a la banda del QR.
 *
 * Si el logo estuviera corrupto o en un formato que jsPDF no entiende,
 * la factura se emite igual sin él: es preferible una factura sin logo
 * que ninguna factura.
 */
function dibujarLogo(doc, logo, yBanda) {
  try {
    const props = doc.getImageProperties(logo)
    const escala = Math.min(
      LOGO_ANCHO_MAX / props.width,
      LOGO_ALTO_MAX / props.height,
    )
    const ancho = props.width * escala
    const alto = props.height * escala

    // Centrado en la altura del QR, para que no baile respecto a él
    const y = yBanda + (QR_MM - alto) / 2
    doc.addImage(logo, 'PNG', MARGEN, y, ancho, alto)
  } catch (e) {
    console.error('[Psicofactur] no se ha podido dibujar el logo:', e)
  }
}

function euros(n) {
  return `${Number(n ?? 0).toFixed(2).replace('.', ',')} €`
}

/** 'ES9121000418450200051332' -> 'ES91 2100 0418 4502 0005 1332' */
function ibanAgrupado(iban) {
  return String(iban ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

function fechaLarga(iso) {
  if (!iso) return ''
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * Construye el PDF de una factura ya emitida.
 *
 * @param {object} p
 * @param {object} p.factura   número, importe, fechas, tipo, QR, exención
 * @param {object} p.emisor    razón social, NIF, dirección fiscal y `logo` opcional (data: URL)
 * @param {object} p.destinatario  nombre y DNI del paciente (DNI opcional)
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function construirFacturaPDF({ factura, emisor, destinatario }) {
  /* `compress` no es un adorno. jsPDF descomprime el PNG del QR y lo
     incrusta como píxeles crudos: sin esto, una factura de una página
     con su QR pesa unos 775 KB, y casi todo es esa imagen. Con la
     compresión activada baja a menos de la décima parte, sin tocar ni
     un píxel —es Flate, sin pérdida— y el QR se lee igual.

     Importa más desde que la factura se manda por correo: ese PDF viaja
     al servidor en base64 (un tercio más de tamaño) cada vez que se
     pulsa Enviar, y muchas veces desde el móvil de la consulta. */
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  let y = MARGEN

  /* ---------- El logo, arriba a la izquierda ----------

     Va en la misma banda que el QR pero pegado al margen izquierdo, y
     con el ancho limitado a propósito: el QR tiene que quedar centrado
     entre los márgenes porque lo exige la Orden HAC/1177/2024, y si el
     logo creciera se lo comería. El tope (LOGO_ANCHO_MAX) deja un
     pasillo libre antes de donde empieza el QR.

     Se dibuja antes que el QR para que, si alguna vez se solaparan por
     un logo rarísimo, el QR quede encima: es el que tiene que poder
     leerse. */
  if (emisor?.logo) {
    dibujarLogo(doc, emisor.logo, y)
  }

  /* ---------- El QR, arriba del todo ----------
     Va antes que ningún otro contenido porque así lo pide la Orden
     HAC/1177/2024. Nivel M de corrección de errores, también dictado. */
  if (factura.qrUrl) {
    const png = await QRCode.toDataURL(factura.qrUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512, // se escala a QR_MM; sobra resolución para imprimir
    })
    const x = (ANCHO_PAGINA - QR_MM) / 2
    doc.addImage(png, 'PNG', x, y, QR_MM, QR_MM)
    y += QR_MM + 5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(LEYENDA_VERIFACTU, ANCHO_PAGINA / 2, y, { align: 'center' })
    y += 4.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(90)
    doc.text(LEYENDA_VERIFACTU_LARGA, ANCHO_PAGINA / 2, y, { align: 'center' })
    doc.setTextColor(0)
    y += 12
  } else if (emisor?.logo) {
    /* Sin QR (Veri*Factu apagado) no hay banda superior que reserve
       sitio: se baja `y` por debajo del logo para que no pise el título. */
    y += LOGO_ALTO_MAX + 8
  }

  /* ---------- Cabecera: qué documento es ---------- */
  const esRectificativa = factura.tipo === 'rectificativa'

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(esRectificativa ? 'FACTURA RECTIFICATIVA' : 'FACTURA', MARGEN, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Nº ${factura.numero}`, ANCHO_PAGINA - MARGEN, y, { align: 'right' })
  y += 6

  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(
    `Fecha de expedición: ${fechaLarga(factura.fechaEmision)}`,
    ANCHO_PAGINA - MARGEN,
    y,
    { align: 'right' },
  )
  y += 4

  /* La fecha de la sesión sólo se imprime si NO es la de expedición.
     Es lo mismo que se le manda a la AEAT en `fecha_operacion`, y aquí
     importa porque una sesión de la semana pasada facturada hoy tiene
     dos fechas distintas y el paciente tiene derecho a ver cuál es
     cuál. */
  if (factura.fechaSesion && factura.fechaSesion !== factura.fechaEmision) {
    doc.text(
      `Fecha de la operación: ${fechaLarga(factura.fechaSesion)}`,
      ANCHO_PAGINA - MARGEN,
      y,
      { align: 'right' },
    )
    y += 4
  }
  doc.setTextColor(0)
  y += 6

  /* ---------- Emisor y destinatario, uno al lado del otro ---------- */
  const columna = ANCHO_UTIL / 2 - 4
  const yBloques = y

  const bloque = (titulo, lineas, x) => {
    let yb = yBloques
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(titulo.toUpperCase(), x, yb)
    yb += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0)
    lineas.filter(Boolean).forEach((linea) => {
      // Las direcciones largas se parten solas dentro de su columna
      doc.splitTextToSize(String(linea), columna).forEach((trozo) => {
        doc.text(trozo, x, yb)
        yb += 4.6
      })
    })
    return yb
  }

  const finEmisor = bloque(
    'Emisor',
    [emisor.razonSocial, `NIF: ${emisor.nif}`, emisor.direccionFiscal],
    MARGEN,
  )

  /* Sin DNI la factura se emitió como simplificada (F2), que legalmente
     no identifica al destinatario. Entonces no se inventa un bloque
     vacío: simplemente no aparece. */
  const finDestinatario = destinatario?.nombre
    ? bloque(
        'Destinatario',
        [
          destinatario.nombre,
          destinatario.dni ? `NIF: ${destinatario.dni}` : null,
          destinatario.domicilio || null,
        ],
        MARGEN + ANCHO_UTIL / 2 + 4,
      )
    : yBloques

  y = Math.max(finEmisor, finDestinatario) + 10

  /* ---------- El concepto y el importe ---------- */
  doc.setDrawColor(210)
  doc.setLineWidth(0.2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text('CONCEPTO', MARGEN, y)
  doc.text('IMPORTE', ANCHO_PAGINA - MARGEN, y, { align: 'right' })
  y += 2
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(0)
  const concepto = doc.splitTextToSize(String(factura.descripcion ?? ''), ANCHO_UTIL - 35)
  concepto.forEach((trozo, i) => {
    doc.text(trozo, MARGEN, y + i * 4.6)
  })
  // En la línea del concepto va el TOTAL de la factura (base + IGIC); la
  // retención de IRPF se descuenta más abajo.
  doc.text(euros(factura.total), ANCHO_PAGINA - MARGEN, y, { align: 'right' })
  y += Math.max(concepto.length * 4.6, 4.6) + 4

  /* A qué factura sustituye. Sin esto, la rectificativa es un papel con
     un importe suelto que no se sabe de dónde sale. */
  if (esRectificativa && factura.numeroRectificada) {
    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text(
      `Rectifica a la factura ${factura.numeroRectificada}${
        factura.motivoRectificacion ? ` · ${factura.motivoRectificacion}` : ''
      }`,
      MARGEN,
      y,
    )
    doc.setTextColor(0)
    y += 6
  }

  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y)
  y += 7

  /* ---------- Base, IGIC/IVA, retención y total ---------- */
  const exenta = Boolean(factura.exencion) && !(Number(factura.tipoIgic) > 0)
  const igic = Number(factura.tipoIgic) || 0
  const irpf = Number(factura.tipoIrpf) || 0
  const base = Number(factura.base ?? factura.total ?? 0)

  const fila = (etiqueta, valor, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal')
    doc.setFontSize(negrita ? 12 : 10)
    doc.text(etiqueta, ANCHO_PAGINA - MARGEN - 45, y, { align: 'right' })
    doc.text(valor, ANCHO_PAGINA - MARGEN, y, { align: 'right' })
    y += negrita ? 7 : 5.5
  }

  fila('Base imponible', euros(base))
  if (igic > 0) {
    fila('IGIC', `${igic}%  ${euros(factura.cuotaIgic)}`)
  } else {
    fila('IGIC / IVA', 'Exenta')
  }
  fila('TOTAL FACTURA', euros(factura.total), true)

  if (irpf > 0) {
    // Guion normal (ASCII), no el signo menos «−» (U+2212): las fuentes
    // base de jsPDF no lo llevan y, al colarse un carácter que no está
    // en su tabla, el visor reparte espacios entre TODAS las cifras y
    // sale «1 5 0, 0 0 €».
    fila(`Retención IRPF ${irpf}%`, `- ${euros(factura.cuotaIrpf)}`)
    fila('LÍQUIDO A PERCIBIR', euros(factura.liquido), true)
  }

  /* ---------- La mención de la exención ---------- */
  if (exenta) {
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(60)
    const mencion = factura.regimenCanarias
      ? MENCION_EXENCION_IGIC[factura.exencion] ?? MENCION_EXENCION_IGIC.DEFECTO
      : MENCION_EXENCION[factura.exencion] ?? MENCION_EXENCION.E6
    doc.splitTextToSize(mencion, ANCHO_UTIL).forEach((trozo) => {
      doc.text(trozo, MARGEN, y)
      y += 4.2
    })
    doc.setTextColor(0)
  }

  /* La retención de IRPF que el cliente ingresa por cuenta de la
     consulta: conviene decirlo, aunque no sea un requisito formal. */
  if (irpf > 0) {
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(60)
    doc.splitTextToSize(
      `Factura sujeta a retención del ${irpf}% de IRPF, que el destinatario ingresará en la Agencia Tributaria por cuenta del emisor.`,
      ANCHO_UTIL,
    ).forEach((trozo) => {
      doc.text(trozo, MARGEN, y)
      y += 4.2
    })
    doc.setTextColor(0)
  }

  /* ---------- Forma de pago ----------
     El IBAN de la consulta, para que el paciente o la empresa sepan a
     dónde transferir. Es opcional: si no está puesto en Ajustes, no
     aparece este bloque. No se le manda a la AEAT. */
  if (emisor?.iban) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text('FORMA DE PAGO', MARGEN, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text('Transferencia bancaria', MARGEN, y)
    y += 4.6
    doc.text(`IBAN: ${ibanAgrupado(emisor.iban)}`, MARGEN, y)
    y += 4.6
  }

  return doc
}

/** Nombre del fichero: «Factura 2026-0001.pdf» (la barra no vale). */
export function nombreFicheroFactura(factura) {
  return `Factura ${String(factura.numero).replace(/\//g, '-')}.pdf`
}

/* En un móvil o una tablet, «compartir» ES la forma de hacerle llegar
   la factura al paciente (WhatsApp, correo, Archivos…). En un ordenador
   no: ahí «Descargar» tiene que descargar, y abrir el diálogo de
   compartir de Windows en vez del de «guardar como» sólo estorba. Se
   distingue por el puntero: `coarse` sin `fine` = pantalla táctil sin
   ratón. */
function esTactilSinRaton() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(pointer: fine)').matches
  )
}

/**
 * Genera el PDF y lo entrega. En el ordenador lo descarga (sale el
 * diálogo de guardar del navegador). En el móvil, si el sistema deja,
 * abre el menú de compartir —que es como se le manda a un paciente— y
 * si no, también lo descarga.
 */
export async function descargarFacturaPDF({ factura, emisor, destinatario }) {
  const doc = await construirFacturaPDF({ factura, emisor, destinatario })
  const nombre = nombreFicheroFactura(factura)

  if (esTactilSinRaton()) {
    const fichero = new File([doc.output('blob')], nombre, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [fichero] })) {
      try {
        await navigator.share({ files: [fichero], title: nombre })
        return
      } catch (e) {
        // Si cancela el menú de compartir no se descarga nada a la fuerza
        if (e?.name === 'AbortError') return
      }
    }
  }

  doc.save(nombre)
}
