-- Migración 0015 — aplicada al proyecto Psicofactur el 23/08/2026
--
-- Facturación automática: cuando pasa la hora de una cita
--
-- Hasta ahora, la fila en `facturas` (el borrador local, el paso 1 antes
-- de emitir a Verifacti) sólo se creaba si ella pulsaba «Facturar» junto
-- al paciente. A partir de aquí se crea sola en cuanto la sesión ya ha
-- pasado, igual que hacía ese botón (mismo importe, misma cita, mismo
-- criterio de "celebrada": `fecha_hora` ya pasada y no cancelada).
--
-- Por eso el botón «Facturar» desaparece de Pacientes: ya no hace falta
-- pulsarlo para que la sesión tenga su fila en facturas. Sigue habiendo
-- un paso manual después — EMITIR la factura a Verifacti/AEAT sigue
-- siendo decisión suya, esto sólo la deja preparada. El modal «Sesiones
-- sin facturar» de la pantalla de Facturación se queda como red de
-- seguridad manual (por si el cron aún no ha pasado por una sesión
-- recién terminada).
--
-- Mismo patrón que `google_sondear()` (0005) y `whatsapp_recordar()`
-- (0008), pero sin Edge Function: crear la fila en `facturas` es un
-- INSERT normal, no hace falta llamar a ningún servicio externo.

create or replace function public.facturar_citas_pasadas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.facturas (psicologa_id, paciente_id, cita_id, importe, fecha_emision, estado_pago)
  select c.psicologa_id, c.paciente_id, c.id, p.precio_sesion, current_date, 'pendiente'
    from public.citas c
    join public.pacientes p on p.id = c.paciente_id
   where c.fecha_hora <= now()
     and c.estado_confirmacion <> 'cancelada'
     -- numero_factura lo pone el trigger asignar_numero_factura()
  -- El predicado tiene que calcar el de idx_facturas_cita_unica (0012):
  -- Postgres exige la misma expresión, no sólo un índice "compatible".
  on conflict (cita_id) where (cita_id is not null and tipo_factura = 'normal') do nothing;
end;
$$;

comment on function public.facturar_citas_pasadas() is
  'Crea la fila en facturas (borrador, sin emitir a Verifacti) para toda cita ya celebrada que todavía no la tenga. La llama el cron cada 15 minutos.';

-- Que no la pueda disparar nadie desde el navegador
revoke execute on function public.facturar_citas_pasadas() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- El reloj: cada 15 minutos
--
-- No hace falta más frecuencia que esa: es una simple inserción sin
-- llamada externa, y así una sesión de las 10:00 tiene su factura
-- borrador como mucho a las 10:15.
-- ---------------------------------------------------------------------
select cron.unschedule('psicofactur-facturar-citas-pasadas')
where exists (select 1 from cron.job where jobname = 'psicofactur-facturar-citas-pasadas');

select cron.schedule(
  'psicofactur-facturar-citas-pasadas',
  '*/15 * * * *',
  $$select public.facturar_citas_pasadas()$$
);
