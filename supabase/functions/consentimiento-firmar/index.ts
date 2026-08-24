/* ================================================================
   consentimiento-firmar

   El paciente ha leído el documento, ha escrito su DNI, ha marcado la
   casilla y ha firmado con el dedo. Esto es lo que lo guarda.

   Sin sesión, como `consentimiento-ver`: lo que autoriza es el token.

   Lo que hace válido a esto no es el dibujo, es lo que se guarda
   alrededor: cuándo se firmó, desde qué IP, con qué DNI y qué VERSIÓN
   del texto se aceptó. Un PNG suelto no acredita nada.

   El enlace es de un solo uso de verdad, y no por educación: la
   escritura se hace en UNA sentencia condicionada al token y al estado
   `PENDIENTE`. Dos pulsaciones seguidas del botón —o dos pestañas
   abiertas— sólo pueden ganar una vez, porque la segunda ya no
   encuentra ninguna fila que cumpla las dos condiciones. Comprobar
   antes y escribir después dejaría un hueco entre las dos cosas.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/supabase.ts'
import {
  DIAS_VALIDEZ,
  VERSION_TEXTO,
  enlaceCaducado,
  ipDeLaPeticion,
  tokenConForma,
} from '../_shared/consentimiento.ts'

/* Un trazo normal (600×200) ronda los 20 KB en base64. El tope está muy
   por encima para que no lo tire una pantalla de más resolución, pero
   impide que alguien use esta columna como almacén. */
const MAXIMO_FIRMA = 1_500_000

/* Y un mínimo, sólo para descartar un «data:image/png;base64,» con
   cuatro caracteres detrás. Que el trazo esté VACÍO no se puede saber
   por el tamaño —un lienzo en blanco pesa lo mismo que uno firmado,
   unos 10 KB— así que eso lo garantiza la pantalla, que no deja pulsar
   el botón sin haber dibujado. */
const MINIMO_FIRMA = 200

const PREFIJO_PNG = 'data:image/png;base64,'

/** Quien firma es una persona: DNI o NIE. Un CIF aquí sería un error. */
const DNI_O_NIE = /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])$/

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

function normalizarDni(valor: unknown): string {
  return String(valor ?? '')
    .toUpperCase()
    .replace(/[\s.\-_/]/g, '')
}

/**
 * La letra tiene que cuadrar con el número, no basta con que la haya.
 *
 * Es la misma comprobación que hace `src/lib/nif.js` en la pantalla, y
 * aquí se repite —siendo la única duplicación del proyecto entre
 * navegador y servidor— porque este DNI no se queda en el documento
 * firmado: si la ficha no tenía ninguno, pasa a `pacientes.dni` y de
 * ahí a las facturas. Un dedazo aquí lo paga Hacienda rechazando un
 * registro un minuto después, con el número de factura ya gastado (fue
 * el error 1239 que dio origen a `lib/nif.js`). La pantalla ya lo
 * impide, pero la pantalla se puede saltar.
 */
function documentoValido(nif: string): boolean {
  if (!DNI_O_NIE.test(nif)) return false

  // En un NIE, la X/Y/Z inicial vale por un 0, 1 o 2
  const prefijo: Record<string, string> = { X: '0', Y: '1', Z: '2' }
  const numero = Number(
    prefijo[nif[0]] !== undefined ? prefijo[nif[0]] + nif.slice(1, 8) : nif.slice(0, 8),
  )

  return nif[8] === LETRAS_DNI[numero % 23]
}

/** El enlace ya no vale. No es un fallo del programa: se responde 200
    con el motivo y la pantalla enseña la explicación que toca. */
function noVale(motivo: string, extra: Record<string, unknown> = {}): Response {
  return json({ firmado: false, motivo, ...extra })
}

Deno.serve(async (req, info) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const cuerpo = await req.json().catch(() => ({}))

  const token = cuerpo?.token
  const firma = String(cuerpo?.firmaBase64 ?? '')
  const dni = normalizarDni(cuerpo?.dni)
  const acepto = cuerpo?.aceptoTerminos === true

  /* El nombre que declara quien firma. Se guarda en su propia columna y
     NO pisa `pacientes.nombre`: esta función es pública, y si escribiera
     ahí, cualquiera con el enlace podría renombrar a un paciente en la
     agenda de la consulta. */
  const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120)

  if (!tokenConForma(token)) return noVale('desconocido')

  /* ---------- Lo que tiene que venir ---------- */
  if (!acepto) {
    return json(
      { mensaje: 'Hay que marcar la casilla de aceptación para poder firmar.' },
      400,
    )
  }
  if (!nombre) {
    return json({ mensaje: 'Falta el nombre y los apellidos de quien firma.' }, 400)
  }
  if (!dni) {
    return json({ mensaje: 'Falta el DNI o NIE de quien firma.' }, 400)
  }
  if (!documentoValido(dni)) {
    return json(
      {
        mensaje:
          'Ese DNI o NIE no es válido: la letra no se corresponde con el número. Compruébalo en el documento.',
      },
      400,
    )
  }
  if (!firma.startsWith(PREFIJO_PNG) || firma.length < MINIMO_FIRMA) {
    return json({ mensaje: 'Falta la firma. Dibújala en el recuadro antes de enviar.' }, 400)
  }
  if (firma.length > MAXIMO_FIRMA) {
    return json({ mensaje: 'La firma ha salido demasiado grande. Vuelve a dibujarla.' }, 413)
  }

  const admin = clienteAdmin()

  /* ---------- ¿Sigue valiendo el enlace? ----------
     Esta lectura es sólo para poder DECIR por qué no vale (caducado,
     ya firmado). Lo que de verdad protege contra la doble firma es el
     update condicionado de abajo. */
  const { data: paciente, error } = await admin
    .from('pacientes')
    .select('id, nombre, consentimiento_estado, consentimiento_fecha_envio')
    .eq('consentimiento_token', token)
    .maybeSingle()

  if (error) {
    console.error('[Psicofactur] no se pudo leer el consentimiento al firmar:', error)
    return json({ mensaje: 'No se ha podido registrar la firma. Inténtalo en unos minutos.' }, 500)
  }

  if (!paciente) return noVale('desconocido')
  if (paciente.consentimiento_estado === 'FIRMADO') return noVale('firmado')
  if (enlaceCaducado(paciente.consentimiento_fecha_envio)) {
    return noVale('caducado', { dias_validez: DIAS_VALIDEZ })
  }

  /* ---------- La firma ----------
     El token se pone a null en la misma sentencia: el enlace deja de
     existir en el instante en que se firma. */
  const firmadoEn = new Date().toISOString()

  const { data: guardado, error: errorFirmar } = await admin
    .from('pacientes')
    .update({
      consentimiento_estado: 'FIRMADO',
      consentimiento_fecha_firma: firmadoEn,
      consentimiento_firma_data: firma,
      consentimiento_dni: dni,
      consentimiento_nombre: nombre,
      consentimiento_ip: ipDeLaPeticion(req, info),
      consentimiento_version: VERSION_TEXTO,
      consentimiento_token: null,
    })
    .eq('consentimiento_token', token)
    .eq('consentimiento_estado', 'PENDIENTE')
    .select('id, nombre')
    .maybeSingle()

  if (errorFirmar) {
    console.error('[Psicofactur] no se pudo registrar la firma:', errorFirmar)
    return json({ mensaje: 'No se ha podido registrar la firma. Inténtalo en unos minutos.' }, 500)
  }

  /* Ninguna fila cumplía las dos condiciones: alguien se ha adelantado
     entre la lectura y la escritura (la otra pestaña, el doble toque).
     El documento está firmado igualmente, así que se cuenta como tal. */
  if (!guardado) return noVale('firmado')

  /* El DNI de la ficha se rellena si estaba vacío: es el dato que hace
     falta para facturar y acaba de darlo el propio paciente. Si ya
     tenía uno NO se toca —puede que ella lo corrigiera a mano— y lo que
     firmó queda en `consentimiento_dni` en cualquier caso. */
  const { error: errorDni } = await admin
    .from('pacientes')
    .update({ dni })
    .eq('id', guardado.id)
    .is('dni', null)

  if (errorDni) {
    console.error('[Psicofactur] firma registrada pero el DNI de la ficha no:', errorDni)
  }

  return json({
    firmado: true,
    fecha_firma: firmadoEn,
    version: VERSION_TEXTO,
    nombre: guardado.nombre,
  })
})
