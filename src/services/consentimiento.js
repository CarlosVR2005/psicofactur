import { supabase } from '../lib/supabase'
import { ejecutar, exito, fallo } from './base'

/* ================================================================
   CONSENTIMIENTO INFORMADO

   Igual que con Verifacti, Google o el correo de las facturas: aquí no
   hay ninguna llamada a Brevo ni ninguna lógica de tokens. Se llama a
   las Edge Functions y son ellas las que saben.

   Tres funciones y dos mundos distintos:

   · `enviarConsentimiento` la usa la psicóloga desde su ficha, con
     sesión abierta.
   · `getConsentimiento` y `firmarConsentimiento` las usa el PACIENTE
     desde la página pública, sin sesión de ninguna clase: lo único que
     le identifica es el token que le llegó por correo.
   ================================================================ */

/** Saca el mensaje que devolvió la Edge Function cuando responde error. */
async function respuestaDeError(error) {
  try {
    const cuerpo = await error?.context?.json?.()
    if (cuerpo?.mensaje) return cuerpo
  } catch (_) {
    // La función ni siquiera respondió JSON
  }
  return null
}

/**
 * Le manda al paciente el enlace para firmar. La dirección de destino
 * no viaja desde aquí: la lee la Edge Function de su ficha.
 *
 * @returns {Promise<{data: {estado, fechaEnvio, destinatario}|null, error: object|null}>}
 */
export async function enviarConsentimiento(pacienteId) {
  if (!pacienteId) {
    return fallo(
      new Error('sin paciente'),
      'enviar el consentimiento',
      'No se ha podido preparar el envío.',
    )
  }

  const { data, error } = await supabase.functions.invoke('enviar-consentimiento', {
    body: { paciente_id: pacienteId },
  })

  if (error) {
    const cuerpo = await respuestaDeError(error)
    const resultado = fallo(error, 'enviar el consentimiento', cuerpo?.mensaje)

    /* El paciente no tiene correo en la ficha: no se arregla
       reintentando, así que la pantalla lo usa para ofrecer editarla. */
    if (cuerpo?.sin_email) resultado.error.sinEmail = true
    if (cuerpo?.ya_firmado) resultado.error.yaFirmado = true
    if (cuerpo?.configuracion_incompleta) resultado.error.configuracionIncompleta = true
    if (cuerpo?.faltan_progenitores) resultado.error.faltanProgenitores = true

    return resultado
  }

  /* `envios` es una entrada por firmante: para un adulto, una; para un
     menor de 16, una por progenitor. `aviso` avisa de un solo tutor. */
  return exito({
    envios: Array.isArray(data?.envios) ? data.envios : [],
    fechaEnvio: data?.fecha_envio ?? new Date().toISOString(),
    aviso: data?.aviso ?? null,
  })
}

/**
 * Los firmantes del consentimiento de un paciente, con su estado. Sin el
 * trazo de la firma (decenas de KB): eso se pide con
 * `getFirmaConsentimiento` sólo cuando ella quiere verlo.
 */
export async function getFirmantes(pacienteId) {
  const { data, error } = await ejecutar(
    supabase
      .from('consentimiento_firmantes')
      .select(
        'id, rol, estado, destinatario_correo, destinatario_nombre, fecha_envio, fecha_firma',
      )
      .eq('paciente_id', pacienteId)
      .order('rol'),
    'cargar los firmantes del consentimiento',
  )
  if (error) return { data: null, error }
  return exito(
    data.map((f) => ({
      id: f.id,
      rol: f.rol,
      estado: f.estado,
      destinatarioCorreo: f.destinatario_correo ?? '',
      destinatarioNombre: f.destinatario_nombre ?? '',
      fechaEnvio: f.fecha_envio ?? '',
      fechaFirma: f.fecha_firma ?? '',
    })),
  )
}

/**
 * Lo que la página pública necesita para pintar el documento.
 *
 * Que el enlace no valga NO es un error: se devuelve
 * `{ valido: false, motivo }` y la pantalla enseña la explicación que
 * toca. Los motivos son 'desconocido', 'caducado' y 'firmado'.
 */
export async function getConsentimiento(token) {
  if (!token) return exito({ valido: false, motivo: 'desconocido' })

  const { data, error } = await supabase.functions.invoke('consentimiento-ver', {
    body: { token },
  })

  if (error) {
    const cuerpo = await respuestaDeError(error)
    return fallo(error, 'abrir el documento', cuerpo?.mensaje)
  }

  if (!data?.valido) {
    return exito({
      valido: false,
      motivo: data?.motivo ?? 'desconocido',
      fechaFirma: data?.fecha_firma ?? null,
      diasValidez: data?.dias_validez ?? null,
    })
  }

  return exito({
    valido: true,
    version: data.version ?? '',
    rol: data.rol ?? 'PACIENTE',
    paciente: {
      nombre: data.paciente?.nombre ?? '',
      dni: data.paciente?.dni ?? '',
      correo: data.paciente?.correo ?? '',
    },
    /* Con qué prerrellenar el formulario. Para un progenitor es su
       propio nombre; su DNI lo escribe él. */
    firmante: {
      nombre: data.firmante?.nombre ?? data.paciente?.nombre ?? '',
      dni: data.firmante?.dni ?? '',
    },
    consulta: {
      nombre: data.consulta?.nombre ?? '',
      razonSocial: data.consulta?.razon_social ?? '',
      nif: data.consulta?.nif ?? '',
      direccionFiscal: data.consulta?.direccion_fiscal ?? '',
      email: data.consulta?.email ?? '',
      telefono: data.consulta?.telefono ?? '',
      numeroColegiado: data.consulta?.numero_colegiado ?? '',
    },
  })
}

/**
 * Registra la firma. Devuelve `{ firmado: true, fechaFirma }`, o
 * `{ firmado: false, motivo }` si el enlace dejó de valer mientras el
 * paciente leía (caducó, o firmó desde otra pestaña).
 */
export async function firmarConsentimiento({
  token,
  firmaBase64,
  nombre,
  dni,
  aceptoTerminos,
}) {
  const { data, error } = await supabase.functions.invoke('consentimiento-firmar', {
    body: { token, firmaBase64, nombre, dni, aceptoTerminos },
  })

  if (error) {
    const cuerpo = await respuestaDeError(error)
    return fallo(error, 'registrar la firma', cuerpo?.mensaje)
  }

  if (!data?.firmado) {
    return exito({ firmado: false, motivo: data?.motivo ?? 'desconocido' })
  }

  return exito({
    firmado: true,
    fechaFirma: data.fecha_firma ?? new Date().toISOString(),
    version: data.version ?? '',
    rol: data.rol ?? 'PACIENTE',
  })
}

/**
 * La firma registrada de UN firmante, para poder verla desde la ficha.
 *
 * Va aparte de `getFirmantes` a propósito: un PNG en base64 son unas
 * decenas de KB, y no tiene sentido moverlo hasta que ella quiere
 * mirarlo.
 */
export async function getFirmaConsentimiento(firmanteId) {
  const { data, error } = await ejecutar(
    supabase
      .from('consentimiento_firmantes')
      .select(
        'rol, firma_data, fecha_firma, nombre, dni, ip, version, destinatario_nombre, pacientes(nombre)',
      )
      .eq('id', firmanteId)
      .single(),
    'cargar la firma del consentimiento',
  )
  if (error) return { data: null, error }

  return exito({
    rol: data.rol ?? 'PACIENTE',
    firma: data.firma_data ?? '',
    fechaFirma: data.fecha_firma ?? '',
    /* El nombre del paciente en la ficha y el que declaró quien firmó.
       Se enseñan los dos cuando no coinciden: un apellido que faltaba,
       o que firmara un tutor. */
    nombreFicha: data.pacientes?.nombre ?? '',
    nombreFirmante: data.nombre ?? data.destinatario_nombre ?? '',
    dni: data.dni ?? '',
    ip: data.ip ?? '',
    version: data.version ?? '',
  })
}
