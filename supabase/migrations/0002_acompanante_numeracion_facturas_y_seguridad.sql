-- Migración 0002 — aplicada al proyecto Psicofactur el 20/08/2026
--
-- Tres decisiones tomadas con Carlos:
--   1. Las citas de pareja guardan a las dos personas.
--   2. La numeración de facturas la pone la base de datos, sin duplicados.
--   3. Se cierran los avisos del linter sobre las funciones de schema.sql.

-- ---------------------------------------------------------------------
-- 1) Segundo paciente en las citas de pareja
--
-- ON DELETE SET NULL (y no CASCADE como en paciente_id): si se borra al
-- acompañante, la sesión del titular no debe desaparecer.
-- ---------------------------------------------------------------------
alter table public.citas
  add column if not exists acompanante_id uuid
    references public.pacientes(id) on delete set null;

comment on column public.citas.acompanante_id is
  'Segunda persona en las sesiones de pareja. Ficha propia en pacientes.';

create index if not exists citas_acompanante_id_idx
  on public.citas (acompanante_id);

alter table public.citas
  drop constraint if exists citas_acompanante_distinto;

alter table public.citas
  add constraint citas_acompanante_distinto
    check (acompanante_id is null or acompanante_id <> paciente_id);


-- ---------------------------------------------------------------------
-- 2) Numeración de facturas sin duplicados
--
-- Por qué un contador y no `CREATE SEQUENCE`:
--   · una secuencia es global — mezclaría la numeración de varias
--     psicólogas, y el esquema es multi-tenant a propósito;
--   · no se reinicia cada 1 de enero, que es como se numera en España.
-- El upsert bloquea la fila del contador, así que dos altas simultáneas
-- se serializan y no pueden obtener el mismo número.
-- ---------------------------------------------------------------------
create table if not exists public.contadores_factura (
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,
  ano smallint not null,
  ultimo integer not null default 0,
  primary key (psicologa_id, ano)
);

comment on table public.contadores_factura is
  'Último número de factura emitido por psicóloga y año. Sólo lo toca el trigger asignar_numero_factura().';

-- RLS activado y sin políticas: nadie llega a esta tabla desde la API.
alter table public.contadores_factura enable row level security;

create or replace function public.asignar_numero_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ano smallint := extract(year from coalesce(new.fecha_emision, current_date))::smallint;
  v_siguiente integer;
begin
  -- Si el número viene puesto a mano (importaciones), se respeta
  if new.numero_factura is not null and new.numero_factura <> '' then
    return new;
  end if;

  insert into public.contadores_factura (psicologa_id, ano, ultimo)
  values (new.psicologa_id, v_ano, 1)
  on conflict (psicologa_id, ano)
    do update set ultimo = contadores_factura.ultimo + 1
  returning ultimo into v_siguiente;

  new.numero_factura := v_ano || '/' || lpad(v_siguiente::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_facturas_numero on public.facturas;

create trigger trg_facturas_numero
  before insert on public.facturas
  for each row
  execute function public.asignar_numero_factura();

revoke execute on function public.asignar_numero_factura()
  from anon, authenticated, public;

-- Red de seguridad: aunque fallara el trigger, la base no admite repetidos
create unique index if not exists facturas_numero_unico
  on public.facturas (psicologa_id, numero_factura);


-- ---------------------------------------------------------------------
-- 3) Avisos del linter sobre las funciones que venían en schema.sql
--    (search_path fijo + no invocables desde /rest/v1/rpc)
-- ---------------------------------------------------------------------
alter function public.sync_estado_confirmacion() set search_path = public;
alter function public.set_updated_at() set search_path = public;

revoke execute on function public.sync_estado_confirmacion()
  from anon, authenticated, public;
revoke execute on function public.set_updated_at()
  from anon, authenticated, public;
