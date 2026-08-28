import { edad } from './fechas'

/* ================================================================
   MENORES DE EDAD

   Dos edades que NO son la misma y que se confunden con facilidad, así
   que viven juntas en un solo sitio:

   · 18 — la mayoría de edad civil. Por debajo, la ficha enseña el aviso
     «menor de edad» y pide los datos de los progenitores (para poder
     llamarlos y para la facturación).

   · 16 — el consentimiento sanitario (Ley 41/2002, art. 9). Por debajo,
     el consentimiento informado lo firman los progenitores; entre 16 y
     17, lo firma el propio paciente, como dice el clausulado de
     `lib/consentimiento.js`.

   Estas dos constantes se replican en
   `supabase/functions/_shared/consentimiento.ts`: el servidor decide a
   quién le manda cada enlace y no puede fiarse de lo que diga el
   navegador. Si se cambian aquí, se cambian allí.
   ================================================================ */

export const MAYORIA_EDAD = 18
export const EDAD_CONSENTIMIENTO_SANITARIO = 16

/** ¿Hay que tratar la ficha como la de un menor? (aviso, progenitores) */
export function esMenorDeEdad(fechaNacimiento) {
  if (!fechaNacimiento) return false
  return edad(fechaNacimiento) < MAYORIA_EDAD
}

/** ¿El consentimiento lo tienen que firmar los progenitores, no el paciente? */
export function firmanLosProgenitores(fechaNacimiento) {
  if (!fechaNacimiento) return false
  return edad(fechaNacimiento) < EDAD_CONSENTIMIENTO_SANITARIO
}

/**
 * Los progenitores que tienen algún dato apuntado, ya normalizados.
 * Devuelve `[{ rol, indice, nombre, dni, correo, telefono }]` — vacío si
 * no hay ninguno. `rol` es 'PROGENITOR_1' | 'PROGENITOR_2', el mismo
 * valor que usa la tabla de firmantes.
 */
export function progenitoresDe(paciente) {
  if (!paciente) return []
  return [1, 2]
    .map((i) => ({
      rol: `PROGENITOR_${i}`,
      indice: i,
      nombre: (paciente[`progenitor${i}Nombre`] ?? '').trim(),
      dni: (paciente[`progenitor${i}Dni`] ?? '').trim(),
      correo: (paciente[`progenitor${i}Correo`] ?? '').trim(),
      telefono: (paciente[`progenitor${i}Telefono`] ?? '').trim(),
    }))
    .filter((p) => p.nombre || p.dni || p.correo || p.telefono)
}
