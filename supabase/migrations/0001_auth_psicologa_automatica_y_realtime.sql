-- Migración 0001 — aplicada al proyecto Psicofactur el 20/08/2026
--
-- Complementa a schema.sql (que ya está ejecutado) con dos cosas que el
-- frontend necesita y que no estaban todavía:
--   1. La fila de `psicologas` se crea sola al registrarse el usuario.
--   2. La tabla `citas` se publica en Realtime.

-- ---------------------------------------------------------------------
-- 1) Alta automática de la psicóloga
--
-- `psicologas` NO tiene política de INSERT (a propósito): así ningún
-- cliente puede inventarse filas. Por eso la creación va en una función
-- SECURITY DEFINER, que se ejecuta con los permisos del propietario y
-- salta el RLS, disparada por el alta en auth.users.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.psicologas (id, nombre, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nombre', ''),
      split_part(coalesce(new.email, 'psicologa'), '@', 1)
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Usuarios que ya existieran antes de crear el trigger
insert into public.psicologas (id, nombre, email)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'nombre', ''),
    split_part(coalesce(u.email, 'psicologa'), '@', 1)
  ),
  coalesce(u.email, '')
from auth.users u
left join public.psicologas p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------------------
-- 2) Realtime sobre citas
--
-- El panel de Recordatorios se suscribe a los cambios de `citas` para
-- repintar el badge de confirmación sin recargar. Mañana quien dispare
-- ese cambio será el webhook de WhatsApp (vía el trigger que ya existe
-- en recordatorios_whatsapp).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.citas;

-- ---------------------------------------------------------------------
-- 3) Endurecer: handle_new_user() sólo la dispara el trigger, nunca la
--    API REST (/rest/v1/rpc/...). Los triggers corren con los permisos
--    del propietario, así que revocar EXECUTE no les afecta.
-- ---------------------------------------------------------------------
revoke execute on function public.handle_new_user() from anon, authenticated, public;
