-- Migración 0022
--
-- El consentimiento informado, con más de un firmante
--
-- Hasta ahora la firma vivía en nueve columnas de `pacientes`
-- (migración 0018): una ficha, una firma. Sirve para un adulto, pero no
-- para un menor de 16, cuyo consentimiento firman los DOS titulares de
-- la patria potestad, cada uno por su lado y desde su propio correo.
--
-- Eso deja de caber en columnas y pasa a filas: una por firmante.
--
-- Lo que se queda en `pacientes`:
--
--   · `consentimiento_estado`, `_fecha_envio` y `_fecha_firma` siguen
--     ahí, pero ahora son un RESUMEN DERIVADO que mantiene un trigger.
--     Así el listado de pacientes sigue siendo una sola consulta y el
--     badge no cambia. Regla: sin firmantes -> NO_ENVIADO; alguno
--     pendiente -> PENDIENTE; todos firmados -> FIRMADO (con un menor,
--     que firme sólo uno de los dos no basta).
--
--   · las otras seis (`_token`, `_firma_data`, `_ip`, `_dni`,
--     `_nombre`, `_version`) se quedan como están, quietas. No se
--     borran en esta migración a propósito: hay una firma real en
--     producción y tirar columnas es irreversible. Se limpian en otra
--     migración cuando esto lleve un tiempo funcionando. El código deja
--     de leerlas y de escribirlas desde ya.

-- ----------------------------------------------------------------
-- 1) La tabla de firmantes
-- ----------------------------------------------------------------
create table if not exists public.consentimiento_firmantes (
  id           uuid primary key default gen_random_uuid(),
  paciente_id  uuid not null references public.pacientes(id)  on delete cascade,
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,

  -- Quién firma esta fila. 'PACIENTE' para un adulto (o un menor de
  -- 16-17, que firma él); 'PROGENITOR_1'/'PROGENITOR_2' para los tutores
  -- de un menor de 16.
  rol text not null check (rol in ('PACIENTE', 'PROGENITOR_1', 'PROGENITOR_2')),

  -- A dónde se mandó y a nombre de quién, CONGELADO: si luego cambia el
  -- correo del progenitor en la ficha, esto tiene que seguir diciendo
  -- adónde fue el enlace que se firmó. Mismo criterio que
  -- `facturas.email_destinatario` (migración 0017).
  destinatario_correo text not null,
  destinatario_nombre text not null default '',

  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'FIRMADO')),

  -- El enlace de un solo uso y su reloj de caducidad. Se pone a null al
  -- firmar, igual que hacía `pacientes.consentimiento_token`.
  token       text,
  fecha_envio timestamptz not null default now(),

  -- Lo que convierte el trazo en prueba, tal cual lo razona la 0018.
  fecha_firma timestamptz,
  firma_data  text,
  ip          text,
  nombre      text,
  dni         text,
  version     text,

  created_at timestamptz not null default now(),

  -- Una fila viva por firmante y paciente. Reenviar es sobrescribir el
  -- token de la fila que ya existe, no crear otra.
  unique (paciente_id, rol)
);

-- El enlace tiene que resolver a UN firmante y sólo a uno; es además por
-- donde entran las dos funciones públicas. Parcial porque el caso normal
-- es no tener token (aún sin enviar, o ya firmado).
create unique index if not exists consentimiento_firmantes_token_unico
  on public.consentimiento_firmantes (token)
  where token is not null;

create index if not exists consentimiento_firmantes_paciente_idx
  on public.consentimiento_firmantes (paciente_id);

comment on table public.consentimiento_firmantes is
  'Una fila por persona que tiene que firmar el consentimiento informado de un paciente. Para un adulto hay una (rol PACIENTE); para un menor de 16, una por progenitor.';
comment on column public.consentimiento_firmantes.token is
  'Enlace de firma de un solo uso (32 bytes aleatorios). Se borra al firmar. Quien lo tiene puede ver y firmar ese documento sin sesión, así que no se enseña en pantalla.';
comment on column public.consentimiento_firmantes.destinatario_correo is
  'La dirección a la que se mandó el enlace, tal como estaba ese día. No se toca aunque luego cambie en la ficha.';

-- ----------------------------------------------------------------
-- 2) RLS: cada psicóloga, lo suyo
-- ----------------------------------------------------------------
alter table public.consentimiento_firmantes enable row level security;

create policy "consentimiento_firmantes_select" on public.consentimiento_firmantes
  for select using (psicologa_id = auth.uid());
create policy "consentimiento_firmantes_insert" on public.consentimiento_firmantes
  for insert with check (psicologa_id = auth.uid());
create policy "consentimiento_firmantes_update" on public.consentimiento_firmantes
  for update using (psicologa_id = auth.uid());
create policy "consentimiento_firmantes_delete" on public.consentimiento_firmantes
  for delete using (psicologa_id = auth.uid());

-- ----------------------------------------------------------------
-- 3) El resumen derivado en `pacientes`
--
-- `security definer` para que el resumen se actualice siempre, lo toque
-- quien lo toque: la función pública `consentimiento-firmar` corre con
-- la clave de servicio, y `enviar-consentimiento` con la sesión de la
-- usuaria. Sólo escribe columnas derivadas del propio paciente.
-- ----------------------------------------------------------------
create or replace function public.refrescar_consentimiento_resumen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente uuid := coalesce(new.paciente_id, old.paciente_id);
  v_total     integer;
  v_pendiente integer;
  v_estado    text;
begin
  select count(*), count(*) filter (where estado = 'PENDIENTE')
    into v_total, v_pendiente
    from public.consentimiento_firmantes
   where paciente_id = v_paciente;

  if v_total = 0 then
    v_estado := 'NO_ENVIADO';
  elsif v_pendiente > 0 then
    v_estado := 'PENDIENTE';
  else
    v_estado := 'FIRMADO';
  end if;

  update public.pacientes p set
    consentimiento_estado = v_estado,
    consentimiento_fecha_envio = (
      select min(fecha_envio) from public.consentimiento_firmantes
       where paciente_id = v_paciente
    ),
    consentimiento_fecha_firma = case
      when v_estado = 'FIRMADO' then (
        select max(fecha_firma) from public.consentimiento_firmantes
         where paciente_id = v_paciente
      )
      else null
    end
  where p.id = v_paciente;

  return null;
end;
$$;

drop trigger if exists consentimiento_firmantes_resumen on public.consentimiento_firmantes;
create trigger consentimiento_firmantes_resumen
  after insert or update or delete on public.consentimiento_firmantes
  for each row execute function public.refrescar_consentimiento_resumen();

-- ----------------------------------------------------------------
-- 4) Traer lo que ya hay
--
-- Una fila 'PACIENTE' por cada paciente al que ya se le había mandado o
-- que ya firmó. Hoy en producción: uno firmado. El trigger de arriba se
-- encarga de dejar el resumen coherente.
-- ----------------------------------------------------------------
insert into public.consentimiento_firmantes (
  paciente_id, psicologa_id, rol,
  destinatario_correo, destinatario_nombre,
  estado, token, fecha_envio, fecha_firma,
  firma_data, ip, nombre, dni, version
)
select
  p.id, p.psicologa_id, 'PACIENTE',
  coalesce(nullif(p.correo, ''), '(sin correo)'),
  p.nombre,
  p.consentimiento_estado,
  p.consentimiento_token,
  coalesce(p.consentimiento_fecha_envio, p.created_at, now()),
  p.consentimiento_fecha_firma,
  p.consentimiento_firma_data,
  p.consentimiento_ip,
  p.consentimiento_nombre,
  p.consentimiento_dni,
  p.consentimiento_version
from public.pacientes p
where p.consentimiento_estado is distinct from 'NO_ENVIADO'
on conflict (paciente_id, rol) do nothing;
