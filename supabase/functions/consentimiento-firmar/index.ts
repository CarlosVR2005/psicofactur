/* ================================================================
   consentimiento-firmar

   Quien firma —el paciente, o el progenitor de un menor— ha leído el
   documento, ha escrito su DNI, ha marcado la casilla y ha firmado con
   el dedo. Esto es lo que lo guarda.

   Sin sesión, como `consentimiento-ver`: lo que autoriza es el token.

   Lo que hace válido a esto no es el dibujo, es lo que se guarda
   alrededor: cuándo, desde qué IP, con qué DNI y qué VERSIÓN del texto
   se aceptó.

   El enlace es de un solo uso de verdad: la escritura se hace en UNA
   sentencia condicionada al token y al estado `PENDIENTE`. Dos
   pulsaciones seguidas —o dos pestañas— sólo pueden ganar una vez.
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

const MAXIMO_FIRMA = 1_500_000
const MINIMO_FIRMA = 200
const PREFIJO_PNG = 'data:image/png;base64,'

const DNI_O_NIE = /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])$/
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

function normalizarDni(valor: unknown): string {
  return String(valor ?? '')
    .toUpperCase()
    .replace(/[\s.\-_/]/g, '')
}

/**
 * La letra tiene que cuadrar con el número. Es la misma comprobación que
 * hace `src/lib/nif.js` en la pantalla, repetida aquí porque este DNI
 * puede acabar en `pacientes.dni` y de ahí en una factura (sólo cuando
 * firma el propio paciente; ver más abajo). Un dedazo lo paga Hacienda
 * rechazando el registro con el número de factura ya gastado.
 */
function documentoValido(nif: string): boolean {
  if (!DNI_O_NIE.test(nif)) return false
  const prefijo: Record<string, string> = { X: '0', Y: '1', Z: '2' }
  const numero = Number(
    prefijo[nif[0]] !== undefined ? prefijo[nif[0]] + nif.slice(1, 8) : nif.slice(0, 8),
  )
  return nif[8] === LETRAS_DNI[numero % 23]
}

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
  const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120)

  if (!tokenConForma(token)) return noVale('desconocido')

  if (!acepto) {
    return json({ mensaje: 'Hay que marcar la casilla de aceptación para poder firmar.' }, 400)
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
     Lectura sólo para poder DECIR por qué no vale. Lo que protege contra
     la doble firma es el update condicionado de abajo. */
  const { data: firmante, error } = await admin
    .from('consentimiento_firmantes')
    .select('id, paciente_id, rol, estado, fecha_envio')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    console.error('[Psicofactur] no se pudo leer el consentimiento al firmar:', error)
    return json({ mensaje: 'No se ha podido registrar la firma. Inténtalo en unos minutos.' }, 500)
  }

  if (!firmante) return noVale('desconocido')
  if (firmante.estado === 'FIRMADO') return noVale('firmado')
  if (enlaceCaducado(firmante.fecha_envio)) {
    return noVale('caducado', { dias_validez: DIAS_VALIDEZ })
  }

  /* ---------- La firma ----------
     El token se pone a null en la misma sentencia. */
  const firmadoEn = new Date().toISOString()

  const { data: guardado, error: errorFirmar } = await admin
    .from('consentimiento_firmantes')
    .update({
      estado: 'FIRMADO',
      fecha_firma: firmadoEn,
      firma_data: firma,
      dni,
      nombre,
      ip: ipDeLaPeticion(req, info),
      version: VERSION_TEXTO,
      token: null,
    })
    .eq('token', token)
    .eq('estado', 'PENDIENTE')
    .select('id, paciente_id, rol')
    .maybeSingle()

  if (errorFirmar) {
    console.error('[Psicofactur] no se pudo registrar la firma:', errorFirmar)
    return json({ mensaje: 'No se ha podido registrar la firma. Inténtalo en unos minutos.' }, 500)
  }

  /* Nadie cumplía las dos condiciones: se han adelantado entre la
     lectura y la escritura. El documento está firmado igualmente. */
  if (!guardado) return noVale('firmado')

  /* El DNI de la ficha se rellena si estaba vacío — pero SÓLO cuando
     firma el propio paciente. El DNI de una madre no puede acabar en la
     ficha del hijo ni, de ahí, en una factura. Lo que declaró queda en
     `consentimiento_firmantes.dni` en cualquier caso. */
  if (guardado.rol === 'PACIENTE') {
    const { error: errorDni } = await admin
      .from('pacientes')
      .update({ dni })
      .eq('id', guardado.paciente_id)
      .is('dni', null)

    if (errorDni) {
      console.error('[Psicofactur] firma registrada pero el DNI de la ficha no:', errorDni)
    }
  }

  return json({
    firmado: true,
    fecha_firma: firmadoEn,
    version: VERSION_TEXTO,
    rol: guardado.rol,
  })
})
