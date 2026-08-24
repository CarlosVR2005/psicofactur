import { errorDeNif, normalizarNif } from './nif'

/* ================================================================
   CONSENTIMIENTO INFORMADO Y PROTECCIÓN DE DATOS

   El texto que lee y firma el paciente. Vive aquí, en un solo sitio,
   por dos motivos:

   · lo pinta la página pública `/consentimiento`, y así el clausulado
     no anda repartido por el JSX;
   · lleva VERSIÓN, y la versión es lo que se guarda junto a la firma
     (`pacientes.consentimiento_version`). Sin ella, un consentimiento
     de 2026 parecería haber aceptado el texto de 2030.

   AL CAMBIAR EL TEXTO hay que subir `VERSION_CONSENTIMIENTO` **y** la
   constante `VERSION_TEXTO` de
   `supabase/functions/_shared/consentimiento.ts`, que es la que se
   graba. Lo ya firmado conserva la suya.

   OJO: esto es un clausulado de partida, escrito siguiendo el RGPD, la
   LOPDGDD y la Ley 41/2002. Antes de usarlo con pacientes reales lo
   tiene que revisar quien lleve la protección de datos de la consulta:
   los plazos de conservación y los encargados del tratamiento dependen
   de con quién se haya firmado contrato.
   ================================================================ */

export const VERSION_CONSENTIMIENTO = '2026-08'

export const ESTADOS = {
  NO_ENVIADO: 'NO_ENVIADO',
  PENDIENTE: 'PENDIENTE',
  FIRMADO: 'FIRMADO',
}

/** Cómo se llama la consulta en el documento. */
export function nombreDeLaConsulta(consulta) {
  return (
    String(consulta?.razonSocial || '').trim() ||
    String(consulta?.nombre || '').trim() ||
    'la consulta'
  )
}

/* Los datos de la consulta se cuelan en mitad de frases distintas, así
   que cada envoltorio trae su puntuación: si falta el NIF —y falta,
   mientras los datos fiscales sean los de relleno— la frase tiene que
   seguir leyéndose bien, sin comas sueltas ni huecos. */

/** «, con NIF 12345678A,» dentro de una frase, o nada si no consta. */
function conNif(consulta) {
  const nif = String(consulta?.nif ?? '').trim()
  return nif ? `, con NIF ${nif},` : ''
}

/** «, NIF 12345678A» al final de una frase. */
function responsable(consulta) {
  const nif = String(consulta?.nif ?? '').trim()
  return nif ? `, NIF ${nif}` : ''
}

function conColegiado(consulta) {
  const numero = String(consulta?.numeroColegiado ?? '').trim()
  return numero ? ` (colegiada nº ${numero})` : ''
}

function contacto(consulta) {
  const partes = []
  const direccion = String(consulta?.direccionFiscal ?? '').trim()
  const email = String(consulta?.email ?? '').trim()
  const telefono = String(consulta?.telefono ?? '').trim()
  if (direccion) partes.push(direccion)
  if (email) partes.push(email)
  if (telefono) partes.push(telefono)
  return partes.join(' · ')
}

/**
 * El documento entero, ya con los datos de la consulta dentro.
 *
 * Devuelve secciones ({ titulo, parrafos }) en vez de un bloque de HTML
 * para que la pantalla pueda maquetarlo como quiera —y para que nadie
 * tenga que meter etiquetas dentro de un texto legal.
 */
export function documentoConsentimiento(consulta) {
  const laConsulta = nombreDeLaConsulta(consulta)
  const datosContacto = contacto(consulta)

  return [
    {
      id: 'quien',
      titulo: 'Quién te atiende',
      parrafos: [
        `La intervención psicológica la presta ${laConsulta}${conColegiado(consulta)}${conNif(consulta)} en su condición de profesional sanitaria, y es también quien responde del tratamiento de tus datos.`,
        datosContacto
          ? `Datos de contacto: ${datosContacto}.`
          : 'Puedes pedir sus datos de contacto completos en la propia consulta.',
      ],
    },
    {
      id: 'intervencion',
      titulo: 'En qué consiste la intervención',
      parrafos: [
        'La atención psicológica empieza con una fase de evaluación y sigue con sesiones de intervención, normalmente de unos 50 minutos, cuya frecuencia se acuerda contigo según cómo vaya el proceso.',
        'Se emplean técnicas psicológicas con respaldo científico. Como en cualquier tratamiento de salud, no es posible garantizar un resultado concreto: la evolución depende de muchos factores, incluida tu implicación fuera de las sesiones.',
        'A lo largo del proceso pueden aparecer momentos de malestar al tratar asuntos difíciles. Es esperable, y forma parte del trabajo terapéutico. Si en algún momento tienes dudas sobre el enfoque, puedes plantearlas y se te explicará.',
      ],
    },
    {
      id: 'voluntario',
      titulo: 'Es voluntario y puedes dejarlo cuando quieras',
      parrafos: [
        'Aceptar este documento es libre y voluntario. Puedes interrumpir el tratamiento en cualquier momento, sin tener que dar explicaciones y sin que eso suponga ningún perjuicio.',
        'También puedes pedir que se te derive a otro profesional si lo prefieres, o solicitar una segunda opinión.',
      ],
    },
    {
      id: 'confidencialidad',
      titulo: 'Confidencialidad y sus límites',
      parrafos: [
        'Todo lo que se hable en las sesiones está protegido por el secreto profesional y no se comparte con nadie. Las notas clínicas se guardan de forma que sólo la profesional pueda consultarlas.',
        'El secreto profesional tiene, por ley, tres excepciones: cuando exista un riesgo grave para tu vida o tu integridad o la de otras personas; cuando lo requiera una autoridad judicial; y cuando haya indicios de maltrato o desprotección de un menor o de una persona dependiente.',
        'Si en algún caso conviniera comentar el proceso con otra profesional para supervisarlo, se haría sin datos que permitan identificarte.',
      ],
    },
    {
      id: 'menores',
      titulo: 'Menores de edad',
      parrafos: [
        'Si la persona atendida es menor de 16 años, este documento lo firma quien tenga la patria potestad o la tutela. Aun así, al menor se le explica el proceso de forma comprensible y se cuenta con su opinión.',
        'La información que se traslada a padres, madres o tutores es la necesaria para el buen curso de la intervención, procurando preservar la intimidad del menor.',
      ],
    },
    {
      id: 'grabaciones',
      titulo: 'Grabaciones y sesiones en línea',
      parrafos: [
        'Las sesiones no se graban. Si en algún caso concreto resultara útil grabar algo con fines terapéuticos, se te pediría permiso aparte y por escrito, y podrías negarte sin ninguna consecuencia.',
        'Si alguna sesión se realiza por videollamada, se usará un sistema con la conexión cifrada. La confidencialidad del lugar desde el que te conectas depende de ti.',
      ],
    },
    {
      id: 'datos',
      titulo: 'Tratamiento de tus datos personales (RGPD)',
      parrafos: [
        `**Responsable.** ${laConsulta}${responsable(consulta)}${datosContacto ? `. ${datosContacto}` : ''}.`,
        '**Para qué se usan tus datos.** Para atenderte: citarte, llevar tu historia clínica, mantener el contacto contigo y emitir las facturas de las sesiones.',
        '**Con qué amparo legal.** Los datos de salud se tratan para la asistencia sanitaria por profesional sujeta a secreto (art. 9.2.h del RGPD y Ley 41/2002); los datos de contacto y facturación, para poder cumplir el acuerdo contigo (art. 6.1.b) y las obligaciones fiscales y sanitarias que la ley impone (art. 6.1.c).',
        '**Cuánto tiempo se conservan.** La historia clínica se conserva al menos cinco años desde el alta de cada proceso asistencial, según la Ley 41/2002; las facturas, los años que exige la normativa fiscal. Después se destruyen o se anonimizan.',
        '**A quién se ceden.** A nadie, salvo obligación legal (por ejemplo, a la Agencia Tributaria en el caso de las facturas). Los sistemas informáticos que se usan para la agenda, el correo y la facturación son proveedores con contrato de encargado del tratamiento y servidores en la Unión Europea.',
        '**Tus derechos.** Puedes pedir acceso a tus datos, rectificarlos, suprimirlos, oponerte al tratamiento, limitarlo o solicitar su portabilidad, escribiendo a la dirección de contacto de arriba. Si crees que tus datos no se están tratando como deberían, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).',
        '**Copia de este documento.** Puedes pedir en cualquier momento una copia del documento que has firmado.',
      ],
    },
  ]
}

/**
 * La frase que se acepta con la casilla. Se guarda aquí y no en el JSX
 * porque es, literalmente, lo que se firma.
 */
export const DECLARACION =
  'He leído y entiendo el consentimiento informado y la información sobre el tratamiento de mis datos personales. He podido preguntar lo que necesitaba y acepto iniciar la intervención psicológica en estas condiciones.'

/**
 * Qué decirle a quien escribe mal su documento.
 *
 * Reutiliza la comprobación de la letra de `lib/nif.js` —la misma que
 * evitó que Hacienda tumbara una factura— y además exige que sea de una
 * PERSONA: quien firma un consentimiento no es una empresa, así que un
 * CIF aquí es un error de quien lo escribe, no un caso raro.
 */
export function errorDeDocumento(valor) {
  const documento = normalizarNif(valor)
  if (!documento) return 'Escribe tu DNI o NIE.'

  const error = errorDeNif(documento)
  if (error) return error

  if (!/^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])$/.test(documento)) {
    return 'Escribe el DNI o NIE de la persona que firma, no un CIF de empresa.'
  }

  return null
}
