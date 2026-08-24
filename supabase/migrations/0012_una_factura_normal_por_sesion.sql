-- ---------------------------------------------------------------------
-- 0012 · «Una factura por sesión» sólo vale para las normales
--
-- `idx_facturas_cita_unica` impedía que una misma cita tuviera dos
-- facturas. Era justo lo que hacía falta cuando sólo había facturas
-- normales: evita cobrar dos veces la misma sesión.
--
-- Pero una rectificativa es, por definición, una segunda factura de esa
-- misma sesión. Con el índice tal cual estaba, rectificar era
-- imposible: la fila nueva chocaba con la original.
--
-- La regla que de verdad se quiere es más estrecha: **una sola factura
-- NORMAL por sesión**. Las rectificativas quedan fuera del índice, y de
-- que no se multipliquen ya se encarga
-- `idx_facturas_una_rectificativa_por_original`, que sólo admite una
-- rectificativa por cada original.
-- ---------------------------------------------------------------------

drop index if exists idx_facturas_cita_unica;

create unique index if not exists idx_facturas_cita_unica
  on public.facturas (cita_id)
  where cita_id is not null and tipo_factura = 'normal';
