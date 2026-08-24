-- Migración 0006 — aplicada al proyecto Psicofactur el 22/08/2026
--
-- WhatsApp Business: preparar la tabla de recordatorios para los envíos
-- reales y para el webhook de Meta.
--
-- Casi todo estaba ya en `schema.sql`: `whatsapp_message_id`, el enum
-- `estado_envio_whatsapp` con los cinco estados que manda Meta,
-- `boton_pulsado` y el trigger `sync_estado_confirmacion`. Aquí sólo se
-- añade lo que faltaba para que el webhook pueda hacer su trabajo.

-- ---------------------------------------------------------------------
-- 1) Por qué falló un envío
--
-- Meta rechaza mensajes por motivos muy concretos (número que no existe
-- en WhatsApp, plantilla no aprobada, ventana cerrada…). Sin guardar el
-- motivo, «No se pudo enviar» no le sirve a nadie para arreglarlo.
-- ---------------------------------------------------------------------
alter table public.recordatorios_whatsapp
  add column if not exists error_mensaje text;

comment on column public.recordatorios_whatsapp.error_mensaje is
  'Motivo que dio Meta al rechazar el envío. Sólo se rellena con estado_envio = fallido.';


-- ---------------------------------------------------------------------
-- 2) Índices
--
-- El webhook llega con el id de mensaje de Meta y tiene que encontrar la
-- fila: sin índice, eso es un recorrido de toda la tabla en cada aviso
-- de «entregado» y «leído», que son varios por recordatorio.
-- ---------------------------------------------------------------------
create index if not exists recordatorios_whatsapp_message_id_idx
  on public.recordatorios_whatsapp (whatsapp_message_id)
  where whatsapp_message_id is not null;

create index if not exists recordatorios_whatsapp_cita_id_idx
  on public.recordatorios_whatsapp (cita_id);


-- ---------------------------------------------------------------------
-- 3) La pantalla de Recordatorios, en vivo
--
-- Hoy el panel se refresca escuchando `citas`, que es lo que cambia el
-- trigger cuando el paciente responde. Con la API real cambian también
-- los estados de envío (entregado, leído, fallido) sin que cambie la
-- cita, así que hay que publicar también esta tabla.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recordatorios_whatsapp'
  ) then
    alter publication supabase_realtime add table public.recordatorios_whatsapp;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) Valores por defecto de `psicologas.whatsapp_config`
--
-- Igual que con Google: aquí sólo va el estado VISIBLE, que lee el
-- navegador. El token de Meta no está aquí ni en ninguna tabla: es un
-- secreto de las Edge Functions.
--
--   activo     → mandar por la API. Con false, el botón Enviar sigue
--                abriendo WhatsApp con el mensaje escrito, como hasta hoy.
--   plantilla  → nombre de la plantilla aprobada en Meta
--   idioma     → código de idioma de esa plantilla
--   horasAntes → antelación del envío automático (fase siguiente)
-- ---------------------------------------------------------------------
update public.psicologas
   set whatsapp_config =
         jsonb_build_object(
           'activo', false,
           'plantilla', 'recordatorio_cita',
           'idioma', 'es',
           'horasAntes', 24
         ) || coalesce(whatsapp_config, '{}'::jsonb)
 where coalesce(whatsapp_config, '{}'::jsonb) = '{}'::jsonb
    or not (whatsapp_config ? 'activo');
