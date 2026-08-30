-- Migración 0028
--
-- Apagar Veri*Factu y emitir facturas en local
--
-- La app registra cada factura ante la AEAT vía Verifacti (Edge Function
-- `generar-factura`). Eso pide el plan de pago de Verifacti, la API key
-- de producción y datos fiscales reales, y de momento no hace falta. Se
-- apaga, pero SIN tirar nada de código: se reengancha cambiando la
-- bandera de abajo (más los secretos y la key, que ya hacían falta).
--
-- Con Veri*Factu apagado, «Emitir» pasa a cerrar la factura en local:
-- le fija la fecha del día y la marca definitiva. A partir de ahí se
-- puede descargar en PDF (sin QR: el QR es un requisito de Veri*Factu,
-- no de una factura ordinaria del RD 1619/2012) y mandársela al
-- paciente. La numeración correlativa la sigue poniendo el trigger
-- `asignar_numero_factura()`, que no se toca.

-- ----------------------------------------------------------------
-- 1) El interruptor
-- ----------------------------------------------------------------
alter table public.psicologas
  add column if not exists verifactu_activo boolean not null default false;

comment on column public.psicologas.verifactu_activo is
  'false = las facturas se cierran en local, sin registro en la AEAT. '
  'true = se registran vía Verifacti (requiere los secretos VERIFACTI_* y '
  'la API key de producción). Cambiarlo es lo único que reengancha Veri*Factu.';

-- ----------------------------------------------------------------
-- 2) La marca de «emitida», independiente de Verifacti
--
-- Hasta ahora «esta factura ya es definitiva» se deducía de tener
-- `verifactu_id`. En modo local no hay `verifactu_id`, así que hace
-- falta una marca propia. En modo Veri*Factu se rellena a la vez que
-- las columnas `verifactu_*`.
--
-- Una factura con `emitida_at` no se edita: se rectifica (serie R).
-- ----------------------------------------------------------------
alter table public.facturas
  add column if not exists emitida_at timestamptz;

comment on column public.facturas.emitida_at is
  'Cuándo se cerró la factura con «Emitir». Null = todavía es borrador. '
  'En modo Veri*Factu se pone junto a verifactu_enviada_at; en modo local '
  'es la única marca de cierre. Una factura con este valor no se edita.';

-- El histórico ya emitido a Hacienda pasa a tener también esta marca,
-- para que la pantalla lo trate igual da el modo en que esté.
update public.facturas
   set emitida_at = coalesce(verifactu_enviada_at, fecha_emision::timestamptz)
 where verifactu_id is not null
   and emitida_at is null;
