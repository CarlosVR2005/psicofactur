/* ================================================================
   Clientes de Supabase para las Edge Functions

   Dos clientes distintos y no son intercambiables:

   · `clienteAdmin()` usa la clave de servicio: salta el RLS. Es el único
     que puede tocar `google_credenciales`. No se le pasa nunca un id que
     venga del navegador sin comprobar antes de quién es la sesión.

   · `psicologaDeLaPeticion()` usa el token de la usuaria: sirve para
     saber quién llama, y sus consultas siguen pasando por el RLS.
   ================================================================ */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

export function clienteAdmin(): SupabaseClient {
  return createClient(URL, SERVICIO, { auth: { persistSession: false } })
}

/** Cliente que actúa en nombre de quien llama (con su RLS puesto). */
export function clienteDeUsuaria(req: Request): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
}

/**
 * Id de la psicóloga que hace la petición, o null si no hay sesión válida.
 * Coincide con `auth.uid()` y con `psicologas.id`.
 */
export async function psicologaDeLaPeticion(req: Request): Promise<string | null> {
  const cabecera = req.headers.get('Authorization')
  if (!cabecera) return null

  const { data, error } = await clienteDeUsuaria(req).auth.getUser()
  if (error) return null
  return data?.user?.id ?? null
}
