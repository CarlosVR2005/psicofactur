-- Migración 0003 — aplicada al proyecto Psicofactur el 20/08/2026
--
-- Mientras no exista el webhook de WhatsApp Business, la psicóloga
-- necesita poder anotar a mano la respuesta que el paciente le da por
-- WhatsApp ("sí, allí estaré").
--
-- Lo hace por el MISMO camino que usará el webhook: escribiendo
-- `recordatorios_whatsapp.boton_pulsado`, que dispara el trigger
-- `sync_estado_confirmacion` y es ese trigger quien actualiza
-- `citas.estado_confirmacion`. El frontend nunca toca esa columna.
--
-- Sin esta política el UPDATE lo bloquea el RLS (la tabla sólo tenía
-- SELECT e INSERT), y el trigger es `AFTER UPDATE OF boton_pulsado`,
-- así que un INSERT no basta para dispararlo.

drop policy if exists recordatorios_update on public.recordatorios_whatsapp;

create policy recordatorios_update
  on public.recordatorios_whatsapp
  for update
  using (psicologa_id = auth.uid())
  with check (psicologa_id = auth.uid());
