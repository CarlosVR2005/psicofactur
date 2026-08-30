-- Migración 0030
--
-- Poner 70 € de precio por sesión a los pacientes que estaban a 0
--
-- Casi todos los pacientes entraron importados de Google Calendar sin
-- precio (`precio_sesion = 0`). El valor por defecto de la consulta es
-- 70 €, así que se les pone eso a todos los que siguen a cero.
--
-- Sus borradores de factura hay que tocarlos también: el importe del
-- borrador se congela al crearlo (lo copian `facturar_citas_pasadas` y
-- `facturarSesion` del `precio_sesion` de ese momento), así que no se
-- actualiza solo. Se pone `base_imponible = 70`, que es la que manda:
-- `total_factura` y `liquido` son columnas GENERATED a partir de ella.
-- Sin esto, «Emitir» seguiría rechazándolos por ser de 0 €.
--
-- Solo se tocan borradores (sin `emitida_at`), de sesión, sin desglose y
-- que sigan a cero. Ninguna factura emitida se ve afectada (no hay).

update public.pacientes
   set precio_sesion = 70
 where coalesce(precio_sesion, 0) = 0;

update public.facturas
   set importe = 70,
       base_imponible = 70
 where emitida_at is null
   and coalesce(importe, 0) = 0
   and coalesce(base_imponible, 0) = 0
   and coalesce(tipo_igic, 0) = 0
   and coalesce(tipo_irpf, 0) = 0
   and concepto is null
   and cita_id is not null;
