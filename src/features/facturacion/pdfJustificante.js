import { jsPDF } from 'jspdf'
import { dibujarLogo, entregarPDF } from './pdfFactura'
import { deClave, fechaLarga, sumarMinutos } from '../../lib/fechas'

/* ================================================================
   EL JUSTIFICANTE DE ASISTENCIA

   El papel que pide el paciente para el trabajo, el colegio o el
   médico: que tal día, a tal hora, estuvo en consulta. Es un documento
   aparte de la factura y a propósito no dice nada de dinero ni del
   motivo de la consulta — sólo que asistió, cuándo y quién lo firma.

   Como la factura, se dibuja aquí en el navegador y no se guarda en
   ningún sitio.
   ================================================================ */

const MARGEN = 25 // mm, algo más que la factura: es una carta
const ANCHO_PAGINA = 210
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2
const INTERLINEA = 6.2

/** 'YYYY-MM-DD' -> 'jueves, 14 de mayo de 2026' */
function fechaCompleta(clave) {
  return `${fechaLarga(deClave(clave))} de ${clave.slice(0, 4)}`
}

/** 'YYYY-MM-DD' -> '14/05/2026' */
function fechaNumerica(clave) {
  return clave.split('-').reverse().join('/')
}

/** Un párrafo partido al ancho útil. Devuelve la `y` siguiente. */
function parrafo(doc, texto, y) {
  doc.splitTextToSize(texto, ANCHO_UTIL).forEach((trozo) => {
    doc.text(trozo, MARGEN, y)
    y += INTERLINEA
  })
  return y
}

/**
 * @param {object} p
 * @param {object} p.sesion     fecha ('YYYY-MM-DD'), hora ('HH:MM'), duracion (min), tipo (texto)
 * @param {object} p.paciente   nombre y DNI (opcional)
 * @param {object} p.psicologa  nombre, NIF, nº de colegiada, dirección y `logo` opcional
 * @param {string} p.fechaExpedicion 'YYYY-MM-DD'
 */
export function construirJustificantePDF({ sesion, paciente, psicologa, fechaExpedicion }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  let y = MARGEN

  if (psicologa.logo) {
    y = dibujarLogo(doc, psicologa.logo, y, { anchoMax: 70, altoMax: 38 }) + 14
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('JUSTIFICANTE DE ASISTENCIA', ANCHO_PAGINA / 2, y, { align: 'center' })
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)

  const colegiada = psicologa.numeroColegiado
    ? `, psicóloga colegiada nº ${psicologa.numeroColegiado}`
    : ', psicóloga'
  const nifPsicologa = psicologa.nif ? `, con NIF ${psicologa.nif}` : ''
  y = parrafo(doc, `${psicologa.nombre}${colegiada}${nifPsicologa},`, y)
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.text('CERTIFICA:', MARGEN, y)
  y += INTERLINEA + 4
  doc.setFont('helvetica', 'normal')

  const dni = paciente.dni ? `, con DNI ${paciente.dni},` : ''
  const horario = sesion.hora
    ? sesion.duracion
      ? `, de ${sesion.hora} a ${sumarMinutos(sesion.hora, Number(sesion.duracion))} h`
      : `, a las ${sesion.hora} h`
    : ''
  y = parrafo(
    doc,
    `Que ${paciente.nombre}${dni} ha asistido a una ${sesion.tipo.toLowerCase()} ` +
      `el ${fechaCompleta(sesion.fecha)}${horario}.`,
    y,
  )
  y += 6

  y = parrafo(
    doc,
    'Y para que así conste a los efectos oportunos, se expide el presente justificante ' +
      `el ${fechaNumerica(fechaExpedicion)}.`,
    y,
  )

  /* ---------- La firma ---------- */
  y += 30
  doc.setDrawColor(150)
  doc.setLineWidth(0.3)
  doc.line(MARGEN, y, MARGEN + 70, y)
  y += 6
  doc.text(psicologa.nombre, MARGEN, y)
  y += 5
  doc.setFontSize(9.5)
  doc.setTextColor(90)
  doc.text(
    psicologa.numeroColegiado ? `Psicóloga · Col. nº ${psicologa.numeroColegiado}` : 'Psicóloga',
    MARGEN,
    y,
  )

  /* ---------- Pie: dónde está la consulta ---------- */
  if (psicologa.direccionFiscal) {
    doc.setFontSize(8.5)
    doc.setTextColor(120)
    const pie = doc.splitTextToSize(psicologa.direccionFiscal, ANCHO_UTIL)
    pie.forEach((trozo, i) => {
      doc.text(trozo, ANCHO_PAGINA / 2, 297 - 15 - (pie.length - 1 - i) * 4, { align: 'center' })
    })
  }
  doc.setTextColor(0)

  return doc
}

/** «Justificante Ana García 14-05-2026.pdf» */
export function nombreFicheroJustificante(paciente, sesion) {
  const nombre = String(paciente.nombre).replace(/[\\/:*?"<>|]/g, '').trim()
  return `Justificante ${nombre} ${sesion.fecha.split('-').reverse().join('-')}.pdf`
}

export async function descargarJustificantePDF(datos) {
  const doc = construirJustificantePDF(datos)
  await entregarPDF(doc, nombreFicheroJustificante(datos.paciente, datos.sesion))
}
