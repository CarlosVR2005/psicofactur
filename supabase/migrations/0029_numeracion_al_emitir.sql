-- Migración 0029
--
-- El número de factura se asigna AL EMITIR, no al crear el borrador
--
-- Hasta ahora `asignar_numero_factura()` corría en el `before insert`, así
-- que cada borrador —los crea el cron `facturar_citas_pasadas` (0015)
-- para toda sesión pasada— gastaba un número. Repetir eso en desarrollo
-- dejó el contador de 2026 en ~10947 con solo ~1440 filas.
--
-- Y es que además incumple: el RD 1619/2012 (art. 6.1.a) pide numeración
-- correlativa, sin huecos y EN ORDEN DE EXPEDICIÓN. Un número reservado
-- por un borrador que quizá nunca se emita rompe esas tres cosas.
--
-- A partir de aquí el número nace cuando la factura se emite, es decir,
-- cuando `emitida_at` pasa de NULL a tener valor (migración 0028). Un
-- borrador no tiene número: en la pantalla pone «Borrador».
--
-- Como no hay ninguna factura legalmente emitida (las 4 que había eran de
-- prueba: entorno de pruebas de la AEAT / un correo a la propia
-- dirección), esta migración además hace el reset de pre-producción:
-- borra esas 4, deja sin número el resto y pone el contador a 0.

-- ----------------------------------------------------------------
-- 1) La función: numerar solo al emitir
-- ----------------------------------------------------------------
create or replace function public.asignar_numero_factura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ano smallint;
  v_serie text;
  v_siguiente integer;
begin
  -- Borrador: todavía no se numera.
  if new.emitida_at is null then
    return new;
  end if;

  -- Ya estaba emitida antes de este UPDATE: nunca se renumera.
  if tg_op = 'UPDATE' and old.emitida_at is not null then
    return new;
  end if;

  -- Número puesto a mano (importaciones): se respeta.
  if new.numero_factura is not null and new.numero_factura <> '' then
    return new;
  end if;

  v_ano := extract(year from coalesce(new.fecha_emision, current_date))::smallint;
  v_serie := case when new.tipo_factura = 'rectificativa' then 'R' else '' end;

  insert into public.contadores_factura (psicologa_id, ano, serie, ultimo)
  values (new.psicologa_id, v_ano, v_serie, 1)
  on conflict (psicologa_id, ano, serie)
    do update set ultimo = contadores_factura.ultimo + 1
  returning ultimo into v_siguiente;

  -- «2026/0001» las normales, «R2026/0001» las rectificativas. A partir
  -- de 10000 el número crece a 5 cifras en vez de romper el formato.
  new.numero_factura := v_serie || v_ano || '/' ||
    lpad(v_siguiente::text, greatest(4, length(v_siguiente::text)), '0');
  return new;
end;
$function$;

revoke execute on function public.asignar_numero_factura()
  from anon, authenticated, public;

-- ----------------------------------------------------------------
-- 2) El trigger: ahora también en UPDATE
--
-- INSERT sigue cubriendo la fila que nace ya emitida (Verifacti la crea
-- y la emite en un paso; las importaciones traen su número). UPDATE
-- cubre el «Emitir» de un borrador que ya existía.
-- ----------------------------------------------------------------
drop trigger if exists trg_facturas_numero on public.facturas;
create trigger trg_facturas_numero
  before insert or update on public.facturas
  for each row
  execute function public.asignar_numero_factura();

-- ----------------------------------------------------------------
-- 3) Reset de pre-producción
--
-- No hay ninguna factura con validez legal, así que esto no toca ningún
-- registro contable: solo limpia el rastro de las pruebas.
-- ----------------------------------------------------------------

-- Las 4 de prueba. Ninguna es rectificativa ni está referenciada por
-- `factura_rectificada_id`, y nada más apunta a `facturas`.
delete from public.facturas where id in (
  '1c46c97a-4c43-4af9-972c-3c93dd513d58',  -- 2026/0001   test, verifactu pruebas
  '2d30d060-a345-4e96-b836-01897fd528c9',  -- 2026/0006   test, correo a la propia dirección
  '49444a02-52ba-4d65-bb23-efc9e6d6acf8',  -- 2026/10425  test, verifactu pruebas 1000 €
  'b0112118-048e-48c7-8d7b-da36185ffcc9'   -- 2026/10945  test, emitida en local
);

-- El resto son borradores: sin número hasta que se emitan.
update public.facturas
   set numero_factura = null
 where emitida_at is null;

-- Contador a cero. La próxima factura emitida será 2026/0001.
update public.contadores_factura
   set ultimo = 0
 where ano = 2026 and serie = '';
