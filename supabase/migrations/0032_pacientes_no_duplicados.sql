-- Migración 0032
--
-- Recordar «estas dos fichas NO son la misma persona»
--
-- El aviso de fichas duplicadas de Pacientes (migración 0031) es una
-- sugerencia: se calcula al vuelo por DNI, teléfono o nombre parecido. Un
-- falso positivo —dos hermanos con el móvil de la madre, dos personas con
-- el mismo nombre— volvía a salir cada vez que se recargaba la página,
-- porque lo de «No son la misma persona» sólo se recordaba en memoria.
--
-- Esta tabla guarda las PAREJAS de fichas que ella ha dicho que son
-- personas distintas. La detección se salta esas parejas.
--
-- Por parejas y no por grupos: si mañana se da de alta una tercera ficha
-- parecida, sólo saldrá esa; las dos ya descartadas no vuelven.
--
-- Cada pareja se guarda UNA vez, con los ids ordenados (paciente_a <
-- paciente_b): el check lo obliga, así que (A, B) y (B, A) no pueden
-- convivir. Si se borra una de las dos fichas —a mano o al fusionarla en
-- otra— la pareja se va sola por el on delete cascade.

create table if not exists public.pacientes_no_duplicados (
  paciente_a   uuid not null references public.pacientes(id)  on delete cascade,
  paciente_b   uuid not null references public.pacientes(id)  on delete cascade,
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,
  created_at   timestamptz not null default now(),

  primary key (paciente_a, paciente_b),
  check (paciente_a < paciente_b)
);

-- La clave primaria cubre las búsquedas por `paciente_a`; para el
-- cascade desde `paciente_b` hace falta su propio índice.
create index if not exists pacientes_no_duplicados_b_idx
  on public.pacientes_no_duplicados (paciente_b);

comment on table public.pacientes_no_duplicados is
  'Parejas de fichas que la psicóloga ha marcado como personas distintas, para que el aviso de duplicados no vuelva a proponerlas. paciente_a < paciente_b siempre.';

-- ----------------------------------------------------------------
-- RLS: cada psicóloga, lo suyo. Sin UPDATE: una pareja se crea o se
-- borra, no se edita.
-- ----------------------------------------------------------------
alter table public.pacientes_no_duplicados enable row level security;

create policy "pacientes_no_duplicados_select" on public.pacientes_no_duplicados
  for select using (psicologa_id = auth.uid());
create policy "pacientes_no_duplicados_insert" on public.pacientes_no_duplicados
  for insert with check (psicologa_id = auth.uid());
create policy "pacientes_no_duplicados_delete" on public.pacientes_no_duplicados
  for delete using (psicologa_id = auth.uid());
