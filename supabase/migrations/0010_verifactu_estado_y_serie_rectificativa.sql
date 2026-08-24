-- ---------------------------------------------------------------------
-- 0010 · Estado del envío a la AEAT y serie propia para rectificativas
--
-- Dos cosas que hacían falta para conectar Verifacti de verdad:
--
-- 1) Saber en qué punto está cada factura.
--    La AEAT no admite envíos en tiempo real: Verifacti encola el
--    registro y lo procesa en aproximadamente un minuto. Así que
--    «emitida» no es un sí o un no, son tres estados —sin enviar,
--    enviada y pendiente de la AEAT, y resuelta— y la pantalla tiene
--    que poder contarlos.
--
-- 2) Numerar las rectificativas en serie aparte.
--    El reglamento de facturación las exige en una serie específica.
--    Hasta ahora el trigger emitía `2026/0001` para todo; a partir de
--    aquí las rectificativas van como `R2026/0001`, con su propio
--    contador, para que ninguna de las dos series tenga huecos.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1) Estado del registro de facturación
-- ---------------------------------------------------------------------

alter table public.facturas
  add column if not exists verifactu_estado text,
  add column if not exists verifactu_error text,
  add column if not exists verifactu_enviada_at timestamptz;

comment on column public.facturas.verifactu_estado is
  'Estado del registro en Verifacti/AEAT. Null = todavía no se ha enviado. '
  'Al crear siempre vuelve «Pendiente»; el estado real («Correcta», '
  '«Incorrecta»…) se consulta después con /verifactu/status. Se guarda '
  'como texto y no como enum a propósito: los estados los define la AEAT '
  'y no queremos una migración cada vez que aparezca uno nuevo.';

comment on column public.facturas.verifactu_error is
  'Lo que respondió Verifacti cuando el envío falló, tal cual. Es el '
  'detalle técnico para depurar; en pantalla se enseña otra cosa.';

comment on column public.facturas.verifactu_enviada_at is
  'Cuándo se aceptó el registro en Verifacti. Null si aún no se ha enviado.';

-- Buscar lo que quedó a medias (enviado y sin resolver) tiene que ser
-- barato: es lo que repasará la consulta de estado.
create index if not exists idx_facturas_verifactu_pendientes
  on public.facturas (verifactu_estado)
  where verifactu_estado is not null and verifactu_estado <> 'Correcta';


-- ---------------------------------------------------------------------
-- 2) Coherencia de las rectificativas
-- ---------------------------------------------------------------------

-- Una rectificativa sin original a la que apuntar no se puede enviar a
-- la AEAT, así que tampoco debería poder existir en la base.
alter table public.facturas
  drop constraint if exists facturas_rectificativa_con_original;

alter table public.facturas
  add constraint facturas_rectificativa_con_original
    check (
      (tipo_factura = 'rectificativa' and factura_rectificada_id is not null)
      or
      (tipo_factura = 'normal' and factura_rectificada_id is null)
    );

-- La misma factura no se rectifica dos veces: si la rectificativa
-- también salió mal, se rectifica ESA, encadenando. Si no, quedarían
-- dos facturas vivas corrigiendo lo mismo y el importe se contaría por
-- duplicado.
create unique index if not exists idx_facturas_una_rectificativa_por_original
  on public.facturas (factura_rectificada_id)
  where factura_rectificada_id is not null;


-- ---------------------------------------------------------------------
-- 3) Serie propia para las rectificativas
-- ---------------------------------------------------------------------

-- El contador pasa a ser por (psicóloga, año, serie). Las filas que ya
-- existían son de la serie normal, que es la cadena vacía.
alter table public.contadores_factura
  add column if not exists serie text not null default '';

alter table public.contadores_factura
  drop constraint if exists contadores_factura_pkey;

alter table public.contadores_factura
  add primary key (psicologa_id, ano, serie);

comment on column public.contadores_factura.serie is
  'Prefijo de la serie: cadena vacía para las facturas normales, «R» '
  'para las rectificativas. Cada serie lleva su propia cuenta.';

create or replace function public.asignar_numero_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ano smallint := extract(year from coalesce(new.fecha_emision, current_date))::smallint;
  v_serie text := case when new.tipo_factura = 'rectificativa' then 'R' else '' end;
  v_siguiente integer;
begin
  -- Si el número viene puesto a mano (importaciones), se respeta
  if new.numero_factura is not null and new.numero_factura <> '' then
    return new;
  end if;

  insert into public.contadores_factura (psicologa_id, ano, serie, ultimo)
  values (new.psicologa_id, v_ano, v_serie, 1)
  on conflict (psicologa_id, ano, serie)
    do update set ultimo = contadores_factura.ultimo + 1
  returning ultimo into v_siguiente;

  -- «2026/0001» las normales, «R2026/0001» las rectificativas.
  -- Al enviarlo a Verifacti se parte por la barra: lo de la izquierda
  -- es la serie y lo de la derecha el número (ver _shared/verifacti.ts).
  new.numero_factura := v_serie || v_ano || '/' || lpad(v_siguiente::text, 4, '0');
  return new;
end;
$$;

revoke execute on function public.asignar_numero_factura()
  from anon, authenticated, public;
