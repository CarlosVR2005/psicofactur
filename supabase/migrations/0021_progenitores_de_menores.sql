-- Migración 0021
--
-- Datos de los progenitores o tutores de un paciente menor de edad
--
-- Cuando el paciente es menor, hay dos cosas que la consulta necesita y
-- que hasta ahora no cabían en ningún sitio:
--
--   · a quién llamar (los padres, no el niño de 12 años);
--   · a quién mandarle el consentimiento informado y la cláusula de
--     protección de datos para que lo firme. Por la Ley 41/2002, por
--     debajo de 16 años firma quien tenga la patria potestad, y son los
--     DOS titulares: hacen falta las dos direcciones.
--
-- Ocho columnas y no un jsonb (a diferencia de `horario_trabajo`, 0019)
-- porque esto no es configuración que sólo lee el navegador: el correo
-- de cada progenitor lo lee también la función `enviar-consentimiento`
-- para decidir a dónde manda cada enlace. Un correo es un dato con
-- nombre propio, no una preferencia.
--
-- Se guardan en la ficha del menor (no en `pacientes` como fichas
-- aparte) a propósito: un progenitor no es un paciente, no se le cita ni
-- se le factura, y su dato sólo tiene sentido colgando del hijo.

alter table public.pacientes
  add column if not exists progenitor1_nombre   text,
  add column if not exists progenitor1_dni       text,
  add column if not exists progenitor1_correo    text,
  add column if not exists progenitor1_telefono  text,
  add column if not exists progenitor2_nombre    text,
  add column if not exists progenitor2_dni       text,
  add column if not exists progenitor2_correo    text,
  add column if not exists progenitor2_telefono  text;

comment on column public.pacientes.progenitor1_nombre is
  'Nombre del primer progenitor o tutor legal del paciente menor. Titular de la patria potestad: es quien firma el consentimiento por debajo de 16 años (Ley 41/2002).';
comment on column public.pacientes.progenitor1_correo is
  'Correo del primer progenitor. Lo lee `enviar-consentimiento` para mandarle su propio enlace de firma.';
comment on column public.pacientes.progenitor2_nombre is
  'Nombre del segundo progenitor o tutor legal. El consentimiento de un menor lo firman los dos por separado.';
comment on column public.pacientes.progenitor2_correo is
  'Correo del segundo progenitor. Su enlace de firma va aquí, distinto del del primero.';
