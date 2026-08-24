-- ---------------------------------------------------------------------
-- 0011 · El estado resuelto se llama «Correcto», no «Correcta»
--
-- El índice de 0010 se escribió antes de haber visto una respuesta real
-- de /verifactu/status. El valor que devuelven es `Correcto`, en
-- masculino —hace juego con `Incorrecto`—, así que el índice parcial
-- estaba filtrando por un valor que no existe y no servía para nada.
--
-- Los estados que hemos visto de verdad:
--   Pendiente   · encolado, la AEAT aún no lo ha procesado
--   Correcto    · aceptado
--   Incorrecto  · rechazado (llega `codigo_error` y `mensaje_error`)
--   Duplicado   · ya había un registro igual
-- más nuestro propio 'error', que significa que ni siquiera se llegó a
-- enviar.
-- ---------------------------------------------------------------------

drop index if exists idx_facturas_verifactu_pendientes;

-- Sólo interesa repescar las que siguen en el aire. Una rechazada ya no
-- cambia sola: hace falta subsanarla.
create index if not exists idx_facturas_verifactu_pendientes
  on public.facturas (verifactu_estado)
  where verifactu_estado = 'Pendiente';
