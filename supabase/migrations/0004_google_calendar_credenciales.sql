-- Migración 0004 — aplicada al proyecto Psicofactur el 22/08/2026
--
-- Google Calendar: credenciales OAuth cifradas.
--
-- El permiso de Google Calendar es INDEPENDIENTE del login: la psicóloga
-- sigue entrando con email y contraseña, y por separado autoriza a la app
-- a tocar su calendario.
--
-- Decisión importante sobre dónde viven los tokens:
--
--   · `psicologas.google_calendar_config` la LEE EL NAVEGADOR (el RLS deja
--     que cada psicóloga vea su propia fila). Por eso ahí sólo va el estado
--     visible: conectado, email, si mostrar el nombre del paciente…
--   · Los tokens van a `google_credenciales`, una tabla con RLS y SIN
--     NINGUNA POLÍTICA: no existe para el navegador. Sólo las Edge
--     Functions, que usan la clave de servicio, pueden llegar a ella.
--   · Y dentro de esa tabla no está el token, sino el identificador de un
--     secreto de Supabase Vault, que lo guarda cifrado.
--
-- Un refresh token de Google no caduca: quien lo tenga puede leer y
-- escribir en el calendario para siempre. De ahí las tres capas.


-- ---------------------------------------------------------------------
-- 1) Credenciales de Google por psicóloga
-- ---------------------------------------------------------------------
create table if not exists public.google_credenciales (
  psicologa_id       uuid primary key references public.psicologas(id) on delete cascade,
  cuenta_email       text,
  -- Punteros a vault.secrets, nunca el token en claro
  refresh_secret_id  uuid,
  access_secret_id   uuid,
  access_expira_en   timestamptz,
  -- Sincronización incremental Google -> app (fase siguiente)
  sync_token         text,
  -- Canal de notificaciones push (fase siguiente, cuando haya dominio propio)
  canal_id           text,
  canal_resource_id  text,
  canal_token        text,
  canal_expira_en    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.google_credenciales is
  'Tokens de Google Calendar por psicóloga. Inaccesible desde el navegador: RLS sin políticas. Los tokens se guardan cifrados en Vault; aquí sólo van sus identificadores.';

alter table public.google_credenciales enable row level security;

-- Sin políticas a propósito: con RLS activo y cero políticas, anon y
-- authenticated no ven ni una fila. `service_role` salta el RLS.
revoke all on public.google_credenciales from anon, authenticated;


-- ---------------------------------------------------------------------
-- 2) Estados OAuth pendientes
--
-- Cuando Google devuelve el `code`, la petición llega SIN sesión de
-- Supabase (es una redirección del navegador, no una llamada de la app).
-- El `state` es un valor aleatorio de un solo uso que guardamos aquí
-- antes de mandar a la usuaria a Google: sirve para saber de quién es la
-- autorización y para que nadie pueda inyectar un `code` ajeno (CSRF).
-- ---------------------------------------------------------------------
create table if not exists public.google_oauth_estados (
  nonce        text primary key,
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,
  origen       text not null,   -- a dónde volver al terminar
  creado_en    timestamptz not null default now()
);

comment on table public.google_oauth_estados is
  'Autorizaciones de Google a medio hacer. Cada fila vale para un solo uso y caduca a los 10 minutos.';

alter table public.google_oauth_estados enable row level security;
revoke all on public.google_oauth_estados from anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) Funciones de acceso
--
-- Todas SECURITY DEFINER (se ejecutan como el propietario, así llegan a
-- `vault`) y todas revocadas para anon/authenticated: sólo las puede
-- llamar `service_role`, es decir, sólo las Edge Functions.
-- ---------------------------------------------------------------------

/* Abre una autorización y devuelve el `state` que hay que mandar a Google. */
create or replace function public.google_crear_estado_oauth(
  p_psicologa_id uuid,
  p_origen text
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nonce text;
begin
  -- Barrido de los que se quedaron a medias
  delete from public.google_oauth_estados where creado_en < now() - interval '10 minutes';

  v_nonce := encode(gen_random_bytes(32), 'hex');
  insert into public.google_oauth_estados (nonce, psicologa_id, origen)
  values (v_nonce, p_psicologa_id, p_origen);

  return v_nonce;
end;
$$;

/* Canjea el `state` que devuelve Google. Un solo uso: se borra al leerlo. */
create or replace function public.google_consumir_estado_oauth(p_nonce text)
returns table (psicologa_id uuid, origen text)
language sql
security definer
set search_path = public
as $$
  delete from public.google_oauth_estados e
  where e.nonce = p_nonce
    and e.creado_en > now() - interval '10 minutes'
  returning e.psicologa_id, e.origen;
$$;

/*
  Guarda los tokens.

  · `p_refresh_token` puede venir null: Google sólo manda refresh token la
    primera vez (por eso pedimos prompt=consent), y al refrescar no lo
    repite. Null significa «no lo toques», nunca «bórralo».
  · El access token se reemplaza cada vez que se refresca.
*/
create or replace function public.google_guardar_credenciales(
  p_psicologa_id uuid,
  p_access_token text,
  p_expira_en timestamptz,
  p_refresh_token text default null,
  p_cuenta_email text default null
) returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_refresh uuid;
  v_access  uuid;
begin
  select refresh_secret_id, access_secret_id
    into v_refresh, v_access
    from public.google_credenciales
   where psicologa_id = p_psicologa_id;

  if p_refresh_token is not null then
    if v_refresh is null then
      -- Por si quedó un secreto huérfano de un intento anterior: el nombre
      -- es único en Vault y create_secret fallaría.
      delete from vault.secrets where name = 'google_refresh_' || p_psicologa_id;
      v_refresh := vault.create_secret(
        p_refresh_token,
        'google_refresh_' || p_psicologa_id,
        'Refresh token de Google Calendar'
      );
    else
      perform vault.update_secret(v_refresh, p_refresh_token);
    end if;
  end if;

  if p_access_token is not null then
    if v_access is null then
      delete from vault.secrets where name = 'google_access_' || p_psicologa_id;
      v_access := vault.create_secret(
        p_access_token,
        'google_access_' || p_psicologa_id,
        'Access token de Google Calendar'
      );
    else
      perform vault.update_secret(v_access, p_access_token);
    end if;
  end if;

  insert into public.google_credenciales as g
    (psicologa_id, cuenta_email, refresh_secret_id, access_secret_id, access_expira_en)
  values
    (p_psicologa_id, p_cuenta_email, v_refresh, v_access, p_expira_en)
  on conflict (psicologa_id) do update set
    cuenta_email      = coalesce(excluded.cuenta_email, g.cuenta_email),
    refresh_secret_id = coalesce(excluded.refresh_secret_id, g.refresh_secret_id),
    access_secret_id  = coalesce(excluded.access_secret_id, g.access_secret_id),
    access_expira_en  = coalesce(excluded.access_expira_en, g.access_expira_en),
    updated_at        = now();
end;
$$;

/* Devuelve los tokens descifrados. La usan todas las Edge Functions. */
create or replace function public.google_leer_credenciales(p_psicologa_id uuid)
returns table (
  cuenta_email      text,
  refresh_token     text,
  access_token      text,
  access_expira_en  timestamptz,
  sync_token        text,
  canal_id          text,
  canal_resource_id text,
  canal_expira_en   timestamptz
)
language sql
security definer
set search_path = public, vault
as $$
  select
    g.cuenta_email,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = g.refresh_secret_id),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = g.access_secret_id),
    g.access_expira_en,
    g.sync_token,
    g.canal_id,
    g.canal_resource_id,
    g.canal_expira_en
  from public.google_credenciales g
  where g.psicologa_id = p_psicologa_id;
$$;

/* Al desconectar: fuera los secretos de Vault y fuera la fila. */
create or replace function public.google_borrar_credenciales(p_psicologa_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets
   where name in ('google_refresh_' || p_psicologa_id, 'google_access_' || p_psicologa_id);
  delete from public.google_credenciales where psicologa_id = p_psicologa_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) Estado visible en la pantalla de Ajustes
--
-- Esto sí lo lee el navegador. Se toca con jsonb || jsonb para no pisar
-- las preferencias que ya hubiera guardadas (mostrarNombre, etc.).
-- ---------------------------------------------------------------------
create or replace function public.google_marcar_conectado(
  p_psicologa_id uuid,
  p_email text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.psicologas
     set google_calendar_config =
           coalesce(google_calendar_config, '{}'::jsonb) ||
           jsonb_build_object(
             'conectado', true,
             'email', p_email,
             'conectadoEn', now(),
             'necesitaReconectar', false
           ),
         updated_at = now()
   where id = p_psicologa_id;
$$;

create or replace function public.google_marcar_desconectado(p_psicologa_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.psicologas
     set google_calendar_config =
           coalesce(google_calendar_config, '{}'::jsonb) ||
           jsonb_build_object(
             'conectado', false,
             'email', null,
             'conectadoEn', null,
             'necesitaReconectar', false
           ),
         updated_at = now()
   where id = p_psicologa_id;
$$;

/*
  Google ha rechazado el refresh token (lo normal: ella revocó el acceso
  desde su cuenta de Google). Nada de fallar en silencio: se apaga la
  conexión y se deja la marca para que Ajustes pida reconectar.
*/
create or replace function public.google_marcar_reconexion_necesaria(p_psicologa_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.psicologas
     set google_calendar_config =
           coalesce(google_calendar_config, '{}'::jsonb) ||
           jsonb_build_object(
             'conectado', false,
             'necesitaReconectar', true
           ),
         updated_at = now()
   where id = p_psicologa_id;
$$;


-- ---------------------------------------------------------------------
-- 5) Cerrar el acceso: estas funciones sólo las llaman las Edge Functions
-- ---------------------------------------------------------------------
revoke execute on function public.google_crear_estado_oauth(uuid, text) from public, anon, authenticated;
revoke execute on function public.google_consumir_estado_oauth(text) from public, anon, authenticated;
revoke execute on function public.google_guardar_credenciales(uuid, text, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.google_leer_credenciales(uuid) from public, anon, authenticated;
revoke execute on function public.google_borrar_credenciales(uuid) from public, anon, authenticated;
revoke execute on function public.google_marcar_conectado(uuid, text) from public, anon, authenticated;
revoke execute on function public.google_marcar_desconectado(uuid) from public, anon, authenticated;
revoke execute on function public.google_marcar_reconexion_necesaria(uuid) from public, anon, authenticated;

grant execute on function public.google_crear_estado_oauth(uuid, text) to service_role;
grant execute on function public.google_consumir_estado_oauth(text) to service_role;
grant execute on function public.google_guardar_credenciales(uuid, text, timestamptz, text, text) to service_role;
grant execute on function public.google_leer_credenciales(uuid) to service_role;
grant execute on function public.google_borrar_credenciales(uuid) to service_role;
grant execute on function public.google_marcar_conectado(uuid, text) to service_role;
grant execute on function public.google_marcar_desconectado(uuid) to service_role;
grant execute on function public.google_marcar_reconexion_necesaria(uuid) to service_role;
