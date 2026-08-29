-- ============================================================
-- Migración 0024 — Cliente particular o empresa; IRPF e IGIC
--
-- Hasta aquí toda factura era una sesión exenta (art. 20 LIVA): el
-- paciente como destinatario, `importe` = base = total, sin desglose.
--
-- Ahora una ficha puede ser de tipo `empresa`. Sus facturas van a
-- nombre de la empresa (empresa_cif), llevan retención de IRPF y pueden
-- llevar IGIC (talleres, formación) en vez de ir exentas.
--
-- Dos cosas que conviene tener presentes:
--  · El IRPF NO viaja a Veri*Factu (su ámbito es IVA/IGIC). Se guarda
--    para el PDF y para saber el líquido que cobra la consulta.
--  · `total_factura` (base + IGIC) es lo que se registra en la AEAT.
--    `liquido` (total − IRPF) es lo que paga el cliente.
--
-- Esta migración NO cambia cómo se emiten las facturas: eso va en un
-- paso posterior, cuando esté confirmado el formato de IGIC de la API
-- de Verifacti. Aquí sólo se añaden las columnas y el tipo de cliente.
-- ============================================================


-- ---------- 1. Ficha: particular o empresa ----------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_cliente') then
    create type public.tipo_cliente as enum ('particular', 'empresa');
  end if;
end
$$;

alter table public.pacientes
  add column if not exists tipo_cliente public.tipo_cliente not null default 'particular',
  add column if not exists empresa_razon_social text,
  add column if not exists empresa_cif          text,
  add column if not exists empresa_domicilio    text;

comment on column public.pacientes.tipo_cliente is
  'particular = la factura va a nombre de la persona, exenta y sin retención (lo de siempre). '
  'empresa = la factura va a nombre de la empresa (empresa_cif), con retención de IRPF y, si no es una sesión exenta, con IGIC.';

-- Si es empresa, tiene que haber al menos razón social y CIF.
alter table public.pacientes
  drop constraint if exists pacientes_empresa_datos;
alter table public.pacientes
  add constraint pacientes_empresa_datos check (
    tipo_cliente = 'particular'
    or (nullif(btrim(empresa_razon_social), '') is not null
        and nullif(btrim(empresa_cif), '') is not null)
  );


-- ---------- 2. Desglose de la factura ----------

alter table public.facturas
  add column if not exists base_imponible         numeric,
  add column if not exists tipo_igic              numeric not null default 0,
  add column if not exists cuota_igic             numeric not null default 0,
  add column if not exists tipo_irpf              numeric not null default 0,
  add column if not exists cuota_irpf             numeric not null default 0,
  add column if not exists concepto               text,
  add column if not exists destinatario_nif       text,
  add column if not exists destinatario_nombre    text,
  add column if not exists destinatario_domicilio text;

-- Las filas que ya existen eran todas sesiones exentas: base = importe.
update public.facturas set base_imponible = importe where base_imponible is null;
alter table public.facturas alter column base_imponible set not null;

-- El cron `facturar_citas_pasadas` (0015) y `facturarSesion` insertan
-- sólo `importe`. Mientras el código no rellene el desglose, base =
-- importe: así esos INSERT siguen funcionando sin tocarlos.
create or replace function public.factura_base_por_defecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_imponible is null then
    new.base_imponible := new.importe;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_factura_base_defecto on public.facturas;
create trigger trg_factura_base_defecto
  before insert on public.facturas
  for each row
  execute function public.factura_base_por_defecto();

revoke execute on function public.factura_base_por_defecto()
  from anon, authenticated, public;

-- total_factura y liquido se calculan solos: así no se pueden descuadrar.
alter table public.facturas
  add column if not exists total_factura numeric
    generated always as (coalesce(base_imponible, 0) + coalesce(cuota_igic, 0)) stored,
  add column if not exists liquido numeric
    generated always as (coalesce(base_imponible, 0) + coalesce(cuota_igic, 0) - coalesce(cuota_irpf, 0)) stored;

comment on column public.facturas.importe is
  'LEGADO: se mantiene igual a total_factura por compatibilidad con el código que aún lo lee. El desglose real está en base_imponible / cuota_igic / cuota_irpf / total_factura / liquido.';
comment on column public.facturas.concepto is
  'Descripción cuando la factura NO sale de una cita (facturas manuales: talleres, formación). Null en las de sesión, que se componen del tipo de cita.';
comment on column public.facturas.destinatario_nif is
  'Copia del NIF/CIF del destinatario tal como estaba al emitir. Para empresas, el CIF. Se guarda aparte de la ficha por lo mismo que email_destinatario: si luego cambian los datos de la empresa, una factura ya emitida no debe cambiar.';
