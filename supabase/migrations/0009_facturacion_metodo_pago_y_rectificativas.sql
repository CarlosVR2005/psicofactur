-- ---------------------------------------------------------------------
-- 0009 · Método de pago y facturas rectificativas
--
-- Esta migración YA ESTABA APLICADA en la base cuando se escribió el
-- fichero: se reconstruye aquí para que el historial de `migrations` y
-- la base vuelvan a contar lo mismo. Todo va con `if not exists`, así
-- que ejecutarla otra vez no cambia nada.
--
-- Las dos ideas de fondo:
--
--  · Una factura emitida NO se borra ni se edita. Si tiene un dato mal,
--    se emite otra que la rectifica y la original queda 'anulada' pero
--    presente. Es lo que exige Veri*Factu y, de paso, lo que hace que
--    la numeración no tenga huecos.
--
--  · `factura_rectificada_id` es lo que une a las dos: la fila nueva
--    apunta a la vieja. Sin ese enlace no se puede reconstruir qué
--    corrigió qué.
-- ---------------------------------------------------------------------

-- Cómo cobró la sesión. Sirve para la contabilidad, no viaja a la AEAT:
-- el registro de facturación no recoge la forma de pago.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'metodo_pago') then
    create type public.metodo_pago as enum
      ('efectivo', 'tarjeta', 'transferencia', 'bizum', 'otro');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_factura') then
    create type public.tipo_factura as enum ('normal', 'rectificativa');
  end if;
end
$$;

-- 'anulada' ≠ 'cancelado'. `cancelado` era «esta sesión no se cobra»;
-- `anulada` es «esta factura la sustituye una rectificativa».
alter type public.estado_pago add value if not exists 'anulada';

alter table public.facturas
  add column if not exists metodo_pago public.metodo_pago,
  add column if not exists tipo_factura public.tipo_factura not null default 'normal',
  add column if not exists factura_rectificada_id uuid references public.facturas(id),
  add column if not exists motivo_rectificacion text;

comment on column public.facturas.factura_rectificada_id is
  'Factura original a la que corrige esta rectificativa. Null en las normales.';

comment on column public.facturas.motivo_rectificacion is
  'Por qué se rectificó, en palabras de la psicóloga. Va como descripción a la AEAT.';
