import { supabase } from '../lib/supabase'

/* ================================================================
   CAPA DE ACCESO A DATOS — utilidades comunes

   Todas las funciones de `src/services/*` devuelven siempre la misma
   forma:

     { data, error }

   · `data`  → lo pedido, o null si algo falló.
   · `error` → null si todo fue bien, o un objeto:
                 { mensaje, tecnico }
               `mensaje` está escrito para que lo entienda cualquiera
               y es lo que se pinta en pantalla; `tecnico` es el error
               original de Supabase y va a la consola para depurar.

   Ninguna función lanza excepciones: la UI nunca se rompe por un
   fallo de red, sólo muestra el aviso.
   ================================================================ */

/** Traduce el error de Postgres/Supabase a algo comprensible. */
function traducir(error, contexto) {
  const codigo = error?.code
  const texto = String(error?.message ?? '')

  // Sin conexión / servidor caído
  if (texto.includes('Failed to fetch') || texto.includes('NetworkError')) {
    return 'No hay conexión con el servidor. Comprueba internet y vuelve a intentarlo.'
  }

  switch (codigo) {
    case '23505': // unique_violation
      return 'Ya existe un registro con esos datos.'
    case '23503': // foreign_key_violation
      return 'No se puede hacer porque hay información relacionada que depende de esto.'
    case '23502': // not_null_violation
      return 'Falta rellenar algún dato obligatorio.'
    case '23514': // check_violation
      return 'Alguno de los datos introducidos no es válido.'
    case '22P02': // invalid_text_representation
      return 'Alguno de los datos tiene un formato incorrecto.'
    case '42501': // insufficient_privilege
      return 'No tienes permiso para hacer esto.'
    case 'PGRST116': // .single() sin resultados
      return 'No se ha encontrado ese registro.'
    default:
      break
  }

  // El RLS rechaza la fila (por ejemplo, psicologa_id que no es la tuya)
  if (texto.includes('row-level security')) {
    return 'No tienes permiso para acceder a esa información.'
  }

  return contexto
    ? `No se ha podido ${contexto}. Inténtalo de nuevo en unos segundos.`
    : 'Algo ha ido mal. Inténtalo de nuevo en unos segundos.'
}

export function exito(data) {
  return { data, error: null }
}

/**
 * @param error     el error original (va a la consola)
 * @param contexto  qué se intentaba hacer, en infinitivo
 * @param mensaje   mensaje ya escrito para la pantalla. Lo usan las Edge
 *                  Functions, que explican mejor que nadie qué ha fallado
 *                  de su lado; sin él se traduce el error de Postgres.
 */
export function fallo(error, contexto, mensaje) {
  // El detalle técnico siempre a la consola: en pantalla sólo el mensaje amable
  console.error(`[Psicofactur] ${contexto ?? 'error'}:`, error)
  return {
    data: null,
    error: { mensaje: mensaje || traducir(error, contexto), tecnico: error },
  }
}

/**
 * Envuelve una consulta de Supabase y normaliza el resultado.
 * @param {Promise} consulta  la query de supabase-js
 * @param {string}  contexto  qué se estaba intentando, en infinitivo:
 *                            'cargar los pacientes', 'guardar la cita'…
 */
export async function ejecutar(consulta, contexto) {
  try {
    const { data, error } = await consulta
    if (error) return fallo(error, contexto)
    return exito(data)
  } catch (e) {
    return fallo(e, contexto)
  }
}

/** Id de la psicóloga con la sesión abierta (= auth.uid() del RLS). */
export async function psicologaActualId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}
