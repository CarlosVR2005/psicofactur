-- Migración 0023
--
-- `refrescar_consentimiento_resumen()` es la función del trigger de la
-- 0022. Al ser `security definer` y vivir en `public`, PostgREST la
-- expone en `/rest/v1/rpc/` y el linter de Supabase avisa: cualquiera
-- con la anon key podría llamarla.
--
-- Llamarla suelta no hace nada útil (sin contexto de trigger, `new` y
-- `old` no existen), pero no tiene por qué estar expuesta. Se le quita
-- el EXECUTE a los roles de la API. El trigger sigue funcionando: corre
-- con los permisos del propietario de la tabla, no con los de quien
-- dispara el INSERT/UPDATE/DELETE.

revoke execute on function public.refrescar_consentimiento_resumen() from anon, authenticated, public;
