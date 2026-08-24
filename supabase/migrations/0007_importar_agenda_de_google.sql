-- Migración 0007 — aplicada al proyecto Psicofactur el 22/08/2026
--
-- Importar la agenda que ya existe en Google Calendar.
--
-- CAMBIO DE PLANTEAMIENTO, decidido con Carlos: manda Google y la app
-- lee. Su madre lleva años trabajando en Google Calendar y además usa
-- las páginas de reserva, así que hay pacientes que entran solos en su
-- calendario sin pasar por la app. Pretender que la app sea la fuente
-- de la verdad era pedirle que cambiara de costumbres.
--
-- El riesgo de importar a lo bruto es crear pacientes llamados
-- «Cerrado» o «Cita urólogo», con su ficha y su hueco en Facturación.
-- Por eso hay dos caminos:
--
--   · Evento CON teléfono en el título -> es una sesión. Se busca al
--     paciente por ese teléfono y, si no existe, se le crea la ficha.
--   · Evento SIN teléfono -> no se inventa nada: va a
--     `eventos_google_pendientes` para que ella lo resuelva.


-- ---------------------------------------------------------------------
-- 1) De dónde salió cada paciente
--
-- Una ficha creada a partir del título de un evento está a medias: sin
-- DNI, sin precio de sesión. Conviene poder distinguirlas para
-- repasarlas y para no alarmarse al ver fichas incompletas.
-- ---------------------------------------------------------------------
alter table public.pacientes
  add column if not exists creado_desde text not null default 'app';

alter table public.pacientes
  drop constraint if exists pacientes_creado_desde_valido;

alter table public.pacientes
  add constraint pacientes_creado_desde_valido
    check (creado_desde in ('app', 'google'));

comment on column public.pacientes.creado_desde is
  'app = ficha creada a mano. google = creada al importar un evento del calendario, probablemente incompleta.';


-- ---------------------------------------------------------------------
-- 2) Eventos que no se sabe de quién son
--
-- La bandeja de entrada de la importación. Una fila por evento de
-- Google que no se ha podido convertir en cita.
--
--   pendiente -> hay que preguntarle a ella
--   ignorado  -> no es una cita; no volver a mostrarlo nunca
--   resuelto  -> ya se convirtió en cita
-- ---------------------------------------------------------------------
create table if not exists public.eventos_google_pendientes (
  id                 uuid primary key default gen_random_uuid(),
  psicologa_id       uuid not null references public.psicologas(id) on delete cascade,
  google_event_id    text not null,
  titulo             text not null,
  inicio             timestamptz not null,
  duracion_minutos   integer not null default 55,
  estado             text not null default 'pendiente',
  -- Lo que se ha podido adivinar del título, para rellenar la ficha
  nombre_detectado   text,
  telefono_detectado text,
  created_at         timestamptz not null default now(),
  unique (psicologa_id, google_event_id)
);

alter table public.eventos_google_pendientes
  drop constraint if exists eventos_google_pendientes_estado_valido;

alter table public.eventos_google_pendientes
  add constraint eventos_google_pendientes_estado_valido
    check (estado in ('pendiente', 'ignorado', 'resuelto'));

comment on table public.eventos_google_pendientes is
  'Eventos de Google Calendar que no se han podido convertir en cita solos. La psicóloga los resuelve desde la app.';

create index if not exists eventos_google_pendientes_bandeja_idx
  on public.eventos_google_pendientes (psicologa_id, estado, inicio);

-- Ella ve y resuelve los suyos. Insertar sólo lo hace la Edge Function
-- (service_role), que es quien habla con Google.
alter table public.eventos_google_pendientes enable row level security;

drop policy if exists "ver los propios eventos pendientes" on public.eventos_google_pendientes;
create policy "ver los propios eventos pendientes"
  on public.eventos_google_pendientes for select
  using (psicologa_id = auth.uid());

drop policy if exists "resolver los propios eventos pendientes" on public.eventos_google_pendientes;
create policy "resolver los propios eventos pendientes"
  on public.eventos_google_pendientes for update
  using (psicologa_id = auth.uid())
  with check (psicologa_id = auth.uid());


-- ---------------------------------------------------------------------
-- 3) Buscar paciente por teléfono
--
-- Los teléfonos están escritos a mano: unos con +34, otros con espacios,
-- otros con guiones. Comparar el texto tal cual no encuentra nada, así
-- que se comparan sólo los NUEVE ÚLTIMOS DÍGITOS, que es lo que
-- identifica de verdad a un número español.
-- ---------------------------------------------------------------------
create or replace function public.paciente_por_telefono(
  p_psicologa_id uuid,
  p_telefono text
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.pacientes p
   where p.psicologa_id = p_psicologa_id
     and length(regexp_replace(coalesce(p.telefono, ''), '\D', '', 'g')) >= 9
     and right(regexp_replace(p.telefono, '\D', '', 'g'), 9)
       = right(regexp_replace(p_telefono, '\D', '', 'g'), 9)
   order by p.activo desc, p.created_at
   limit 1;
$$;

revoke execute on function public.paciente_por_telefono(uuid, text) from public, anon;
grant execute on function public.paciente_por_telefono(uuid, text) to service_role, authenticated;


-- ---------------------------------------------------------------------
-- 4) Buscar paciente por nombre
--
-- Sólo para las reservas de la página de Google («Horarios para cita
-- (Nombre Apellido)»), que traen el nombre pero no el teléfono. Se
-- comparan sin tildes ni espacios de sobra, que es donde falla el
-- tecleo a mano.
-- ---------------------------------------------------------------------
create or replace function public.paciente_por_nombre(
  p_psicologa_id uuid,
  p_nombre text
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.pacientes p
   where p.psicologa_id = p_psicologa_id
     and lower(translate(regexp_replace(trim(p.nombre), '\s+', ' ', 'g'),
               'áéíóúüàèìòùâêîôûñçÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÑÇ',
               'aeiouuaeiouaeiouncAEIOUUAEIOUAEIOUNC'))
       = lower(translate(regexp_replace(trim(p_nombre), '\s+', ' ', 'g'),
               'áéíóúüàèìòùâêîôûñçÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÑÇ',
               'aeiouuaeiouaeiouncAEIOUUAEIOUAEIOUNC'))
   order by p.activo desc, p.created_at
   limit 1;
$$;

revoke execute on function public.paciente_por_nombre(uuid, text) from public, anon;
grant execute on function public.paciente_por_nombre(uuid, text) to service_role, authenticated;
