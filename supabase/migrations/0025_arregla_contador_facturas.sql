-- ============================================================
-- Migración 0025 — El contador de números de factura se desbocaba
--
-- Síntoma: dejó de poder crearse ninguna factura nueva (sesión o
-- manual), con error de clave duplicada en `facturas_numero_unico`.
--
-- Causa, tres capas:
--
--  1. `facturar_citas_pasadas` (0015) hacía
--       insert into facturas (...) select ... on conflict (cita_id) do nothing
--     El trigger BEFORE INSERT `asignar_numero_factura` se ejecuta ANTES
--     del ON CONFLICT, así que por cada cita YA facturada (≈190) sumaba
--     1 al contador aunque la fila se descartara después. Cada pasada
--     del cron (cada 15 min) subía el contador ~190.
--
--  2. `asignar_numero_factura` formatea con `lpad(n::text, 4, '0')`, y
--     `lpad` RECORTA cuando el número tiene más de 4 cifras: 78499 ->
--     '7849'. El contador ya iba por ~78000, así que los números que
--     generaba chocaban con facturas de 4 cifras que ya existían.
--
--  3. El contador de 2026 quedó en ~78498 cuando el último número real
--     es 2026/9699.
--
-- Arreglo:
--  1. El cron sólo mira citas SIN factura normal -> el trigger no se
--     dispara en balde.
--  2. `asignar_numero_factura` nunca recorta: pad a 4 cifras como
--     mínimo, pero deja pasar los números más largos tal cual.
--  3. Se recoloca el contador de 2026 al último número real.
-- ============================================================


-- ---------- 1. El cron no reintenta lo ya facturado ----------

create or replace function public.facturar_citas_pasadas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.facturas
    (psicologa_id, paciente_id, cita_id, importe, fecha_emision, estado_pago)
  select c.psicologa_id, c.paciente_id, c.id, p.precio_sesion, current_date, 'pendiente'
    from public.citas c
    join public.pacientes p on p.id = c.paciente_id
   where c.fecha_hora <= now()
     and c.estado_confirmacion <> 'cancelada'
     and not exists (
       select 1 from public.facturas f
        where f.cita_id = c.id and f.tipo_factura = 'normal'
     );
end;
$$;

comment on function public.facturar_citas_pasadas() is
  'Crea la fila borrador en facturas para toda cita ya celebrada que aún no la tenga. La llama el cron cada 15 minutos. Filtra por NOT EXISTS (y no por ON CONFLICT) para que el trigger de numeración no se dispare por las que ya están facturadas.';

revoke execute on function public.facturar_citas_pasadas() from public, anon, authenticated;


-- ---------- 2. El número de factura no se recorta ----------

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

  -- Pad a 4 cifras como mínimo. `greatest` evita que `lpad` recorte los
  -- números de 5 o más cifras (2026/10000, no 2026/1000).
  new.numero_factura := v_serie || v_ano || '/' ||
    lpad(v_siguiente::text, greatest(4, length(v_siguiente::text)), '0');
  return new;
end;
$$;

revoke execute on function public.asignar_numero_factura() from anon, authenticated, public;


-- ---------- 3. Recolocar el contador al último número real ----------

update public.contadores_factura c
   set ultimo = coalesce((
         select max((split_part(f.numero_factura, '/', 2))::bigint)
           from public.facturas f
          where f.psicologa_id = c.psicologa_id
            and f.numero_factura ~ ('^' || c.ano::text || '/[0-9]+$')
       ), 0)
 where c.serie = '';
