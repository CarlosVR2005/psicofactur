-- Migración 0027
--
-- Historia clínica del paciente: entradas fechadas y su documentación
--
-- Hasta ahora la ficha sólo tenía `pacientes.observaciones`: un campo de
-- texto libre que se sobrescribe cada vez que se toca. Sirve para el
-- resumen estable («viene derivado por…», «prefiere los martes»), pero
-- no es una historia clínica: no hay cronología ni queda rastro de qué
-- se escribió y cuándo.
--
-- La Ley 41/2002 —y el propio texto de consentimiento que firma el
-- paciente (`src/lib/consentimiento.js`)— habla de un registro
-- CRONOLÓGICO del proceso asistencial, con la documentación que lo
-- acompaña (informes, pruebas, derivaciones, escritos del colegio…).
--
-- Aquí eso pasa a filas: `historia_entradas`, una por sesión o hito, y
-- `historia_adjuntos`, los ficheros que cuelgan de cada entrada.
--
-- `observaciones` se queda como está, en la pestaña «Ficha».
--
-- ----------------------------------------------------------------
-- Por qué los adjuntos van a Storage y NO en base64 en una columna
--
-- Es el criterio contrario al del logo (migración 0014), y a propósito:
--
--  · Un informe psicológico o un TAC son varios MB. El logo son unas
--    decenas de KB y casi nunca cambia.
--  · La historia clínica NO se carga con la lista de pacientes: se abre
--    una ficha cada vez. No hay el problema de «engordar una consulta
--    que se hace para todos».
--  · SÍ es un dato sensible —categoría especial del RGPD, salud— y gana
--    por estar en un sitio con permisos propios: un bucket privado, sin
--    URL pública, al que sólo se llega con enlace firmado de un minuto.


-- ----------------------------------------------------------------
-- 1) Las entradas de la historia
-- ----------------------------------------------------------------
create table if not exists public.historia_entradas (
  id           uuid primary key default gen_random_uuid(),
  paciente_id  uuid not null references public.pacientes(id)  on delete cascade,
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,

  -- La fecha del HECHO clínico (la sesión, el día del informe), no la de
  -- redacción. Por eso es editable y no un `created_at`: una nota se
  -- puede pasar a limpio días después.
  fecha date not null default current_date,

  titulo text not null,

  -- Puede ir vacío: una entrada que sólo aporta un documento («Informe
  -- del colegio») es válida.
  texto text,

  -- La cita de ese día, si la entrada nace desde la agenda. `set null`
  -- porque borrar una cita no debe borrar lo que se escribió de ella.
  cita_id uuid references public.citas(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.historia_entradas is
  'Historia clínica: una fila por sesión o hito asistencial de un paciente, en orden cronológico. `fecha` es la del hecho clínico, no la de redacción.';

-- La pantalla siempre pide «las de este paciente, de la más reciente a
-- la más antigua».
create index if not exists historia_entradas_paciente_idx
  on public.historia_entradas (paciente_id, fecha desc, created_at desc);

alter table public.historia_entradas enable row level security;

drop policy if exists historia_entradas_select on public.historia_entradas;
create policy historia_entradas_select on public.historia_entradas
  for select using (psicologa_id = auth.uid());

drop policy if exists historia_entradas_insert on public.historia_entradas;
create policy historia_entradas_insert on public.historia_entradas
  for insert with check (psicologa_id = auth.uid());

drop policy if exists historia_entradas_update on public.historia_entradas;
create policy historia_entradas_update on public.historia_entradas
  for update using (psicologa_id = auth.uid());

drop policy if exists historia_entradas_delete on public.historia_entradas;
create policy historia_entradas_delete on public.historia_entradas
  for delete using (psicologa_id = auth.uid());

drop trigger if exists trg_historia_entradas_updated_at on public.historia_entradas;
create trigger trg_historia_entradas_updated_at
  before update on public.historia_entradas
  for each row
  execute function public.set_updated_at();


-- ----------------------------------------------------------------
-- 2) Los documentos adjuntos
--
-- `paciente_id` y `psicologa_id` van desnormalizados a propósito:
--   · `psicologa_id`, para el RLS, como en todo el esquema.
--   · `paciente_id`, para poder listar y limpiar los ficheros de un
--     paciente en Storage sin pasar por `historia_entradas` (lo usa el
--     borrado de paciente, que corre antes de que la cascada actúe).
-- El fichero en sí vive en el bucket `historia`; aquí sólo su metadato.
-- ----------------------------------------------------------------
create table if not exists public.historia_adjuntos (
  id           uuid primary key default gen_random_uuid(),
  entrada_id   uuid not null references public.historia_entradas(id) on delete cascade,
  paciente_id  uuid not null references public.pacientes(id)  on delete cascade,
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,

  -- Ruta dentro del bucket: `{psicologa_id}/{paciente_id}/{uuid}.{ext}`.
  -- El uuid evita colisiones y mantiene fuera de la ruta el nombre
  -- original, que puede llevar el nombre del paciente.
  ruta text not null unique,

  -- El nombre original, para enseñarlo y para la descarga.
  nombre    text not null,
  tipo_mime text,
  tamano    bigint,

  created_at timestamptz not null default now()
);

comment on table public.historia_adjuntos is
  'Metadatos de los ficheros de la historia clínica. El binario está en el bucket privado `historia`, en la ruta `ruta`.';

create index if not exists historia_adjuntos_entrada_idx
  on public.historia_adjuntos (entrada_id);
create index if not exists historia_adjuntos_paciente_idx
  on public.historia_adjuntos (paciente_id);

alter table public.historia_adjuntos enable row level security;

drop policy if exists historia_adjuntos_select on public.historia_adjuntos;
create policy historia_adjuntos_select on public.historia_adjuntos
  for select using (psicologa_id = auth.uid());

drop policy if exists historia_adjuntos_insert on public.historia_adjuntos;
create policy historia_adjuntos_insert on public.historia_adjuntos
  for insert with check (psicologa_id = auth.uid());

drop policy if exists historia_adjuntos_update on public.historia_adjuntos;
create policy historia_adjuntos_update on public.historia_adjuntos
  for update using (psicologa_id = auth.uid());

drop policy if exists historia_adjuntos_delete on public.historia_adjuntos;
create policy historia_adjuntos_delete on public.historia_adjuntos
  for delete using (psicologa_id = auth.uid());


-- ----------------------------------------------------------------
-- 3) El bucket privado y sus políticas
--
-- Privado (`public = false`): no hay URL permanente, se descarga con
-- enlace firmado de corta vida desde el frontend.
--
-- El primer segmento de la ruta es el `psicologa_id`; las políticas lo
-- comparan con `auth.uid()`, igual de estrictas que las de las tablas.
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'historia',
  'historia',
  false,
  15728640, -- 15 MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists historia_storage_select on storage.objects;
create policy historia_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'historia'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists historia_storage_insert on storage.objects;
create policy historia_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'historia'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists historia_storage_update on storage.objects;
create policy historia_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'historia'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists historia_storage_delete on storage.objects;
create policy historia_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'historia'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
