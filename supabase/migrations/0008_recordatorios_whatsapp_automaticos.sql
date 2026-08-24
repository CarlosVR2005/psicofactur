-- Migración 0008 — aplicada al proyecto Psicofactur el 22/08/2026
--
-- WhatsApp: que el recordatorio salga solo
--
-- Hasta ahora el recordatorio lo mandaba ella pulsando Enviar. Aquí se
-- añade el envío automático: cada hora la base llama a la Edge Function
-- `enviar-recordatorios-automaticos`, que mira qué citas caen dentro de
-- la ventana de antelación (24 h por defecto) y manda el mensaje.
--
-- NO se añade `citas.recordatorio_enviado`. Esa columna sería un
-- duplicado de algo que ya se sabe: si en `recordatorios_whatsapp` hay
-- una fila automática para la cita, ya se avisó. Un booleano aparte se
-- desincroniza el primer día que un envío falle a medias, y además no
-- diría CUÁNDO ni CÓMO fue. El punto 2 de aquí abajo es la versión que
-- no se puede desincronizar, porque la impone la base.
--
-- ANTES DE QUE ESTO FUNCIONE hacen falta dos cosas:
--   · el secreto `clave_servicio_supabase` en Vault (ya se puso para el
--     sondeo de Google, migración 0005: si está, esto ya tira);
--   · la función desplegada:
--       supabase functions deploy enviar-recordatorios-automaticos


-- ---------------------------------------------------------------------
-- 1) De dónde salió cada recordatorio
--
-- Manual = ella le dio a Enviar. Automático = lo mandó el cron. Se
-- distinguen porque el histórico es lo que ella mira cuando un paciente
-- dice «a mí no me ha llegado nada», y no es lo mismo «no se mandó» que
-- «se mandó solo a las 9:05».
-- ---------------------------------------------------------------------
alter table public.recordatorios_whatsapp
  add column if not exists origen text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recordatorios_whatsapp_origen_check'
  ) then
    alter table public.recordatorios_whatsapp
      add constraint recordatorios_whatsapp_origen_check
      check (origen in ('manual', 'automatico'));
  end if;
end;
$$;

comment on column public.recordatorios_whatsapp.origen is
  'manual = lo mandó ella desde la pantalla. automatico = lo mandó el cron con la antelación de whatsapp_config.horasAntes.';


-- ---------------------------------------------------------------------
-- 2) Un solo recordatorio automático por cita
--
-- Este índice es el que impide de verdad que un paciente reciba el
-- mismo aviso dos veces. La Edge Function apunta la fila ANTES de
-- llamar a Meta, así que si dos vueltas del cron se solapan, la segunda
-- choca aquí (error 23505) y se retira sin mandar nada.
--
-- Los envíos manuales quedan fuera a propósito: reenviar a mano tiene
-- que seguir siendo posible, es lo que hace ella cuando el paciente
-- dice que no le llegó.
-- ---------------------------------------------------------------------
create unique index if not exists recordatorios_whatsapp_auto_unica
  on public.recordatorios_whatsapp (cita_id)
  where origen = 'automatico';

-- La función busca por (psicóloga, ventana de fechas, pendientes).
-- `idx_citas_psicologa_fecha` ya cubre las dos primeras.


-- ---------------------------------------------------------------------
-- 3) El acuse de recibo
--
-- Cuando el paciente pulsa un botón, el webhook le contesta con un
-- «✅ Tu cita ha quedado confirmada». Se puede apagar: es un mensaje
-- más, y aunque las respuestas dentro de la ventana de 24 h no se
-- facturan como plantilla, hay quien prefiere no escribir de más.
-- ---------------------------------------------------------------------
update public.psicologas
   set whatsapp_config = coalesce(whatsapp_config, '{}'::jsonb) || jsonb_build_object('acuse', true)
 where not (coalesce(whatsapp_config, '{}'::jsonb) ? 'acuse');


-- ---------------------------------------------------------------------
-- 4) El disparo
--
-- Mismo patrón que `google_sondear()` (migración 0005): la clave de
-- servicio sale de Vault y no aparece en ningún archivo del proyecto.
-- Con esa clave, la Edge Function recorre todas las consultas que
-- tengan el envío automático encendido.
-- ---------------------------------------------------------------------
create or replace function public.whatsapp_recordar()
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
    raise warning '[Psicofactur] falta el secreto clave_servicio_supabase en Vault: no se mandan los recordatorios automáticos';
    return;
  end if;

  perform net.http_post(
    url := 'https://ozmwivoatmzqonqykuuy.supabase.co/functions/v1/enviar-recordatorios-automaticos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_clave
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

comment on function public.whatsapp_recordar() is
  'Pide a la Edge Function enviar-recordatorios-automaticos que mande los recordatorios de las citas que entran en la ventana de antelación. La llama el cron cada hora.';

-- Que no la pueda disparar nadie desde el navegador
revoke execute on function public.whatsapp_recordar() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5) El reloj: cada hora, en el minuto 5
--
-- CADA HORA, y no una vez al día, porque la ventana que mira la función
-- es de una hora de ancho (de 23 h a 24 h antes de la cita). Así el
-- aviso le llega al paciente a la misma hora del día anterior a su
-- sesión, y no todos a las ocho de la mañana.
--
-- En el minuto 5 para no coincidir con el sondeo de Google, que va en
-- los minutos en punto.
--
-- No hacen falta horas de silencio: una cita de las 9:00 avisa a las
-- 9:00 del día antes y la última del día, sobre las 21:00. De noche no
-- hay citas, así que de noche no sale ningún mensaje.
-- ---------------------------------------------------------------------
select cron.unschedule('psicofactur-whatsapp-recordatorios')
where exists (select 1 from cron.job where jobname = 'psicofactur-whatsapp-recordatorios');

select cron.schedule(
  'psicofactur-whatsapp-recordatorios',
  '5 * * * *',
  $$select public.whatsapp_recordar()$$
);
