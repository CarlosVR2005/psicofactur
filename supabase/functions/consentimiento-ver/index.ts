/* ================================================================
   consentimiento-ver

   Lo primero que hace la página pública de firma: «este enlace, ¿de
   quién es y sigue valiendo?».

   AQUÍ NO HAY SESIÓN. Quien llama es un paciente desde el correo, que
   no tiene cuenta de Supabase ni la va a tener. Lo que autoriza es el
   TOKEN, igual que la firma de Meta autoriza el webhook de WhatsApp:
   64 caracteres aleatorios que sólo están en su buzón.

   Por eso se usa el cliente de servicio (salta el RLS) y por eso la
   consulta se hace SIEMPRE por `consentimiento_token`, nunca por un id
   que venga del navegador. Es la única forma de que este endpoint no
   sea una ventana abierta a la lista de pacientes.

   Se devuelve lo mínimo para que el paciente reconozca su documento:
   su nombre, su DNI si ya lo tiene la ficha, y los datos de la
   consulta que el RGPD obliga a enseñar (responsable, NIF, dirección y
   correo). Ni citas, ni facturas, ni observaciones.
   ================================================================ */

import { json, respuestaPreflight } from '../_shared/cors.ts'
import { clienteAdmin } from '../_shared/supabase.ts'
import {
  DIAS_VALIDEZ,
  VERSION_TEXTO,
  enlaceCaducado,
  tokenConForma,
} from '../_shared/consentimiento.ts'

/* Que el enlace no valga NO es un error del programa: es uno de los
   finales normales de esta pantalla. Se responde 200 con el motivo, y
   la página enseña la explicación que toca en vez de un aviso rojo. */
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

  const { data: paciente, error } = await admin
    .from('pacientes')
    .select(
      `id, nombre, dni, correo, activo, psicologa_id,
       consentimiento_estado, consentimiento_fecha_envio, consentimiento_fecha_firma`,
    )
    .eq('consentimiento_token', token)
    .maybeSingle()

  if (error) {
    console.error('[Psicofactur] no se pudo comprobar el consentimiento:', error)
    return json({ mensaje: 'No se ha podido abrir el documento. Inténtalo en unos minutos.' }, 500)
  }

  /* Sin fila: el token no existe, o ya se firmó (al firmar se borra) o
     se mandó uno nuevo que dejó el anterior sin efecto. Desde fuera los
     tres casos se ven igual y se cuentan igual, a propósito: decir
     «este enlace ya se firmó» a quien no debería tenerlo ya sería
     contar algo de un paciente. */
  if (!paciente) return noVale('desconocido')

  if (paciente.consentimiento_estado === 'FIRMADO') {
    return noVale('firmado', { fecha_firma: paciente.consentimiento_fecha_firma })
  }

  if (enlaceCaducado(paciente.consentimiento_fecha_envio)) {
    return noVale('caducado', { dias_validez: DIAS_VALIDEZ })
  }

  /* Los datos de la consulta: quién es el responsable del tratamiento.
     Sin esto el clausulado no se sostiene, porque el RGPD exige decir
     ante quién se ejercen los derechos. */
  const { data: psicologa } = await admin
    .from('psicologas')
    .select('nombre, razon_social, nif, direccion_fiscal, email, telefono, numero_colegiado')
    .eq('id', paciente.psicologa_id)
    .single()

  return json({
    valido: true,
    version: VERSION_TEXTO,
    paciente: {
      nombre: paciente.nombre,
      dni: paciente.dni ?? '',
      correo: paciente.correo ?? '',
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
