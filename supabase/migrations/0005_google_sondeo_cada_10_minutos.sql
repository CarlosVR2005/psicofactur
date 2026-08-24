-- Migración 0005 — aplicada al proyecto Psicofactur el 22/08/2026
--
-- Google Calendar: traerse a la app los cambios hechos fuera de ella.
--
-- Cada 10 minutos la base de datos llama a la Edge Function
-- `sincronizar-desde-google`, que pregunta a Google qué ha cambiado
-- desde la última vez y actualiza las citas.
--
-- POR QUÉ SONDEO Y NO EL WEBHOOK PUSH DE GOOGLE
--   1. Google exige que el dominio que recibe las notificaciones esté
--      verificado como propio, y `supabase.co` no lo es.
--   2. La notificación push no lleva datos: sólo dice «algo ha
--      cambiado». Habría que llamar igualmente a esta misma función.
-- O sea que el push sólo ahorraría la espera, y cuando haya dominio
-- propio se enchufa sin tocar el motor (las columnas `canal_*` de
-- `google_credenciales` ya están puestas para eso).
--
-- ANTES DE QUE ESTO FUNCIONE hay que guardar la clave de servicio en
-- Vault, una sola vez, desde el editor SQL de Supabase:
--
--   select vault.create_secret(
--     'PEGA_AQUI_LA_SERVICE_ROLE_KEY',
--     'clave_servicio_supabase',
--     'Clave de servicio para que el cron llame a las Edge Functions'
--   );
--
-- Va cifrada en Vault y no aparece en ningún archivo del proyecto.


-- ---------------------------------------------------------------------
-- 1) Extensiones
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;   -- el reloj
create extension if not exists pg_net;    -- llamadas HTTP desde la base


-- ---------------------------------------------------------------------
-- 2) El disparo
--
-- La Edge Function distingue quién la llama por el `role` del token:
-- con la clave de servicio sincroniza a todas las psicólogas
-- conectadas; con la sesión de una, sólo la suya (el botón «Traer
-- cambios de Google» de Ajustes).
-- ---------------------------------------------------------------------
create or replace function public.google_sondear()
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_clave text;
begin
  select decrypted_secret into v_clave
    from vault.decrypted_secrets
   where name = 'clave_servicio_supabase';

  if v_clave is null then
    raise warning '[Psicofactur] falta el secreto clave_servicio_supabase en Vault: el sondeo de Google no se ejecuta';
    return;
  end if;

  perform net.http_post(
    url := 'https://ozmwivoatmzqonqykuuy.supabase.co/functions/v1/sincronizar-desde-google',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_clave
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

comment on function public.google_sondear() is
  'Pide a la Edge Function sincronizar-desde-google que traiga los cambios de Google Calendar. La llama el cron cada 10 minutos.';

-- Que no la pueda disparar nadie desde el navegador
revoke execute on function public.google_sondear() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) El reloj: cada 10 minutos
--
-- Es de sobra para una consulta: si mueve una cita en el móvil, la app
-- lo refleja como mucho 10 minutos después. Y como `citas` está en
-- Realtime, la pantalla se repinta sola sin recargar.
-- ---------------------------------------------------------------------
select cron.unschedule('psicofactur-google-sondeo')
where exists (select 1 from cron.job where jobname = 'psicofactur-google-sondeo');

select cron.schedule(
  'psicofactur-google-sondeo',
  '*/10 * * * *',
  $$select public.google_sondear()$$
);
