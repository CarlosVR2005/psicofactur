/* La app llama a las funciones desde el navegador (localhost en
   desarrollo, el dominio de la PWA en producción), así que hace falta
   responder al preflight. */

export const cabecerasCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function respuestaPreflight(): Response {
  return new Response('ok', { headers: cabecerasCors })
}

export function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cabecerasCors, 'Content-Type': 'application/json' },
  })
}
