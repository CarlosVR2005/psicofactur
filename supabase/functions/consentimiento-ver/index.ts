/* ================================================================
   consentimiento-ver

   Lo primero que hace la página pública de firma: «este enlace, ¿de
   quién es y sigue valiendo?».

   AQUÍ NO HAY SESIÓN. Quien llama es un paciente —o el progenitor de un
   menor— desde el correo. Lo que autoriza es el TOKEN: 64 caracteres
   aleatorios que sólo están en su buzón.

   Por eso se usa el cliente de servicio (salta el RLS) y la consulta se
   hace SIEMPRE por `token`, nunca por un id que venga del navegador.

   Se devuelve lo mínimo para que quien firma reconozca el documento: a
   quién trata la consulta (el menor, si firma un progenitor), el nombre
   con el que se le puede prerrellenar el formulario, y los datos de la
   consulta que el RGPD obliga a enseñar.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/supabase.ts'
import {
  DIAS_VALIDEZ,
  VERSION_TEXTO,
  enlaceCaducado,
  tokenConForma,
} from '../_shared/consentimiento.ts'

function noVale(motivo: string, extra: Record<string, unknown> = {}): Response {
  return json({ valido: false, motivo, ...extra })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respuestaPreflight()

  const cuerpo = await req.json().catch(() => ({}))
  const token = cuerpo?.token

  if (!tokenConForma(token)) {
    return noVale('desconocido')
  }

  const admin = clienteAdmin()

  const { data: firmante, error } = await admin
    .from('consentimiento_firmantes')
    .select('id, paciente_id, rol, estado, destinatario_nombre, fecha_envio, fecha_firma')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    console.error('[Psicofactur] no se pudo comprobar el consentimiento:', error)
    return json({ mensaje: 'No se ha podido abrir el documento. Inténtalo en unos minutos.' }, 500)
  }

  /* Sin fila: el token no existe, ya se firmó (al firmar se borra) o se
     mandó uno nuevo que dejó el anterior sin efecto. Los tres se ven y
     se cuentan igual, a propósito. */
  if (!firmante) return noVale('desconocido')

  if (firmante.estado === 'FIRMADO') {
    return noVale('firmado', { fecha_firma: firmante.fecha_firma })
  }

  if (enlaceCaducado(firmante.fecha_envio)) {
    return noVale('caducado', { dias_validez: DIAS_VALIDEZ })
  }

  const { data: paciente } = await admin
    .from('pacientes')
    .select('nombre, dni, correo, psicologa_id')
    .eq('id', firmante.paciente_id)
    .single()

  const esProgenitor = firmante.rol === 'PROGENITOR_1' || firmante.rol === 'PROGENITOR_2'

  const { data: psicologa } = await admin
    .from('psicologas')
    .select('nombre, razon_social, nif, direccion_fiscal, email, telefono, numero_colegiado')
    .eq('id', paciente?.psicologa_id)
    .single()

  return json({
    valido: true,
    version: VERSION_TEXTO,
    rol: firmante.rol,
    /* A quién trata la consulta. Para un progenitor es el menor. */
    paciente: {
      nombre: paciente?.nombre ?? '',
      dni: esProgenitor ? '' : (paciente?.dni ?? ''),
      correo: esProgenitor ? '' : (paciente?.correo ?? ''),
    },
    /* Con qué prerrellenar el formulario. Para un progenitor, su nombre
       tal como está en la ficha del menor; su DNI lo escribe él, nunca
       se prerrellena con el del hijo. */
    firmante: {
      nombre: esProgenitor ? (firmante.destinatario_nombre ?? '') : (paciente?.nombre ?? ''),
      dni: esProgenitor ? '' : (paciente?.dni ?? ''),
    },
    consulta: {
      nombre: psicologa?.nombre ?? '',
      razon_social: psicologa?.razon_social ?? '',
      nif: psicologa?.nif ?? '',
      direccion_fiscal: psicologa?.direccion_fiscal ?? '',
      email: psicologa?.email ?? '',
      telefono: psicologa?.telefono ?? '',
      numero_colegiado: psicologa?.numero_colegiado ?? '',
    },
  })
})
