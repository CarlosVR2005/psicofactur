-- Migración 0017 — aplicada al proyecto Psicofactur el 24/08/2026
--
-- Mandarle la factura al paciente por correo
--
-- Hasta ahora la factura se descargaba en PDF y ella la mandaba a mano
-- por donde podía. Aquí se añade el botón que la envía sola al email
-- que el paciente tenga en su ficha.
--
-- Se apunta CUÁNDO se mandó y A QUÉ dirección, y las dos cosas hacen
-- falta:
--   · sin la fecha, no hay forma de saber si esa factura ya salió, y se
--     acaba mandando dos veces (o ninguna);
--   · sin la dirección, si mañana el paciente cambia su email en la
--     ficha, la app diría que la factura se mandó «a su correo» cuando
--     en realidad fue al anterior. Guardar la dirección de entonces es
--     lo único que sobrevive a que la ficha cambie.
--
-- No se guarda el PDF. Se genera en el navegador cada vez que hace
-- falta, igual que para descargarlo, y así no hay facturas de una
-- consulta de psicología almacenadas en ningún sitio.

alter table public.facturas
  add column if not exists email_enviado_at timestamptz,
  add column if not exists email_destinatario text;

comment on column public.facturas.email_enviado_at is
  'Cuándo se le mandó la factura al paciente por correo. Null = no se ha mandado nunca.';

comment on column public.facturas.email_destinatario is
  'La dirección a la que se mandó, tal como estaba en la ficha ese día. Se guarda aparte de pacientes.correo a propósito: si el paciente cambia de email, esto tiene que seguir diciendo adónde fue.';
