-- ---------------------------------------------------------------------
-- 0026 · El número de cuenta (IBAN) de la consulta, para la factura
--
-- Va IMPRESO en el PDF para que el paciente o la empresa sepan a dónde
-- transferir. No se le manda a la AEAT (Veri*Factu no lleva forma de
-- pago) y no es obligatorio para emitir: si está vacío, la factura
-- simplemente no muestra el bloque de «Forma de pago».
--
-- Se guarda normalizado —sin espacios y en mayúsculas— porque es como
-- se compara y se valida un IBAN; la pantalla y el PDF lo reagrupan en
-- bloques de cuatro para leerlo.
-- ---------------------------------------------------------------------

alter table public.psicologas
  add column if not exists iban text;

comment on column public.psicologas.iban is
  'IBAN de la consulta, sin espacios y en mayúsculas. Se imprime en la '
  'factura como forma de pago. No se envía a la AEAT. Null = no se '
  'muestra forma de pago.';

alter table public.psicologas
  drop constraint if exists psicologas_iban_razonable;

alter table public.psicologas
  add constraint psicologas_iban_razonable
    check (
      iban is null
      or iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'
    );
