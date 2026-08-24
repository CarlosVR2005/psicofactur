import { createClient } from '@supabase/supabase-js'

/* Cliente único de Supabase para toda la app.
   Las claves vienen de .env (ver .env.example). */

const url = import.meta.env.VITE_SUPABASE_URL
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !clave) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example como .env, rellena los valores y reinicia `npm run dev`.',
  )
}

export const supabase = createClient(url, clave, {
  auth: {
    // La sesión se guarda en localStorage y se renueva sola: en el iPhone,
    // abrir la app desde la pantalla de inicio no obliga a entrar de nuevo.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
