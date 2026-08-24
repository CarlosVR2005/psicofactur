-- Migración 0016 — aplicada al proyecto Psicofactur el 24/08/2026
--
-- Lista de espera: quién quiere hueco en una semana que ya está llena
--
-- El caso real: llama un paciente pidiendo cita «para esta semana», y
-- esa semana no queda nada. Hasta ahora eso se apuntaba en un papel o
-- se quedaba en la cabeza, y cuando alguien cancelaba había que
-- acordarse de a quién le venía bien ese hueco.
--
-- Aquí se apunta: el paciente, la ventana de días en la que le sirve la
-- cita, si la quiere de mañana o de tarde, y una nota. Cuando una cita
-- se cancela, la pantalla cruza el hueco que se ha liberado con quien
-- está esperando y lo enseña.
--
-- NO hay tabla de «huecos liberados». Un hueco liberado no es un dato
-- nuevo que haya que guardar: es una cita que ya existe con
-- `estado_confirmacion = 'cancelada'` y fecha futura. Guardarlo aparte
-- sería una copia que se desincroniza en cuanto ella toque esa cita.


create table if not exists public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,
  paciente_id  uuid not null references public.pacientes(id)  on delete cascade,

  -- La ventana en la que le sirve la cita. Casi siempre una semana,
  -- pero se guarda como dos fechas porque «esta semana o la que viene»
  -- es igual de habitual y no cabe en un solo campo «semana».
  desde date not null,
  hasta date not null,

  franja text not null default 'cualquiera',
  tipo public.tipo_cita not null default 'individual',
  nota text,

  estado text not null default 'esperando',

  -- La cita que se le acabó dando. Queda apuntada para poder mirar
  -- atrás y ver que esa espera terminó bien.
  cita_id uuid references public.citas(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lista_espera_ventana_valida check (hasta >= desde),
  constraint lista_espera_franja_check
    check (franja in ('manana', 'tarde', 'cualquiera')),
  constraint lista_espera_estado_check
    check (estado in ('esperando', 'avisado', 'resuelto', 'cancelado'))
);

comment on table public.lista_espera is
  'Pacientes esperando a que se libere un hueco. Una fila por espera; el orden de la cola lo da created_at.';

comment on column public.lista_espera.franja is
  'manana = antes de las 14:00. tarde = de las 14:00 en adelante. cualquiera = le vale todo.';

comment on column public.lista_espera.estado is
  'esperando = en la cola. avisado = se le ha ofrecido un hueco y no ha contestado todavía. resuelto = ya tiene su cita (ver cita_id). cancelado = ya no quiere o no hizo falta.';


-- ---------------------------------------------------------------------
-- Una espera activa por paciente
--
-- Si llama dos veces no debe salir dos veces en la cola: se edita la
-- que ya tiene. Las resueltas y canceladas quedan fuera del índice a
-- propósito — son el histórico, y ahí sí puede haber varias del mismo
-- paciente a lo largo del año.
-- ---------------------------------------------------------------------
create unique index if not exists lista_espera_paciente_activo
  on public.lista_espera (paciente_id)
  where estado in ('esperando', 'avisado');

-- La pantalla siempre pide «las activas de esta psicóloga, por orden de
-- llegada»
create index if not exists lista_espera_cola
  on public.lista_espera (psicologa_id, estado, created_at);


-- ---------------------------------------------------------------------
-- Seguridad: cada psicóloga ve y toca sólo lo suyo (igual que `citas`)
-- ---------------------------------------------------------------------
alter table public.lista_espera enable row level security;

drop policy if exists lista_espera_select on public.lista_espera;
create policy lista_espera_select on public.lista_espera
  for select using (psicologa_id = auth.uid());

drop policy if exists lista_espera_insert on public.lista_espera;
create policy lista_espera_insert on public.lista_espera
  for insert with check (psicologa_id = auth.uid());

drop policy if exists lista_espera_update on public.lista_espera;
create policy lista_espera_update on public.lista_espera
  for update using (psicologa_id = auth.uid());

drop policy if exists lista_espera_delete on public.lista_espera;
create policy lista_espera_delete on public.lista_espera
  for delete using (psicologa_id = auth.uid());


-- `set_updated_at()` ya existe desde el esquema inicial
drop trigger if exists trg_lista_espera_updated_at on public.lista_espera;
create trigger trg_lista_espera_updated_at
  before update on public.lista_espera
  for each row
  execute function public.set_updated_at();
