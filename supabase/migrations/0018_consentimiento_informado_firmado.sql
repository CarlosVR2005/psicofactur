-- Migración 0018 — aplicada al proyecto Psicofactur el 24/08/2026
--
-- Consentimiento informado y protección de datos (RGPD)
--
-- El papel que hasta ahora se firmaba en la consulta: el consentimiento
-- informado de la terapia y la cláusula de tratamiento de datos. Se le
-- manda al paciente por correo un enlace, lo firma con el dedo en el
-- móvil y queda registrado aquí.
--
-- Por qué cada columna, que no es evidente:
--
--   · `consentimiento_token` es una CAPACIDAD, no un identificador: quien
--     tiene el enlace puede ver y firmar ese documento sin sesión de
--     Supabase. Por eso es aleatorio de 32 bytes, único, y se pone a null
--     en cuanto se firma — un enlace de un solo uso que además no se puede
--     reutilizar si el correo se reenvía a un tercero.
--
--   · `consentimiento_ip` y `consentimiento_fecha_firma` no son telemetría:
--     son lo que convierte un dibujo en una prueba. Una firma manuscrita
--     digitalizada sin fecha ni origen no acredita nada frente a una
--     reclamación; con ellas se puede sostener quién firmó, cuándo y desde
--     dónde (art. 7 y 5.2 del RGPD, «responsabilidad proactiva»).
--
--   · `consentimiento_dni` y `consentimiento_nombre` se guardan aparte de
--     `pacientes.dni` y `pacientes.nombre` a propósito. Los de la ficha son
--     datos vivos, que ella corrige cuando hace falta; éstos son los que
--     escribió el paciente AL FIRMAR y no deben cambiar nunca, igual que
--     `facturas.email_destinatario` guarda la dirección de aquel día y no
--     la de hoy (migración 0017).
--
--     Y hay un motivo de seguridad además del legal: la página de firma es
--     pública. Si escribir ahí el nombre cambiara `pacientes.nombre`,
--     cualquiera con el enlace podría renombrar a un paciente en la agenda
--     de la consulta. Lo que declara el firmante se queda en su columna.
--
--   · `consentimiento_version` dice QUÉ texto se aceptó. El clausulado
--     cambiará con los años; sin esto, un consentimiento de 2026 parecería
--     haber aceptado el texto de 2030. Es la diferencia entre tener un
--     consentimiento y tener un dibujo.
--
-- La firma se queda en esta tabla (RLS de la psicóloga), no en Storage:
-- un PNG de un trazo pesa unos 20 KB y así no hay firmas de pacientes
-- colgando de ninguna URL, por el mismo criterio que las facturas.

alter table public.pacientes
  add column if not exists consentimiento_estado      text not null default 'NO_ENVIADO',
  add column if not exists consentimiento_token       text,
  add column if not exists consentimiento_fecha_envio timestamptz,
  add column if not exists consentimiento_fecha_firma timestamptz,
  add column if not exists consentimiento_firma_data  text,
  add column if not exists consentimiento_ip          text,
  add column if not exists consentimiento_dni         text,
  add column if not exists consentimiento_nombre      text,
  add column if not exists consentimiento_version     text;

-- Los tres estados y nada más. Se hace en dos pasos porque Postgres no
-- admite `add constraint if not exists`, y así la migración se puede
-- volver a pasar sin romperse.
alter table public.pacientes
  drop constraint if exists pacientes_consentimiento_estado_check;

alter table public.pacientes
  add constraint pacientes_consentimiento_estado_check
  check (consentimiento_estado in ('NO_ENVIADO', 'PENDIENTE', 'FIRMADO'));

-- El enlace tiene que resolver a UN paciente y sólo a uno, y este índice
-- es además por donde entran las dos funciones públicas: siempre buscan
-- por token. Es parcial porque el caso normal es no tener ninguno (ni
-- enviado todavía, o ya firmado), y esas mil filas no pintan nada en un
-- índice que sólo se usa para resolver enlaces vivos.
create unique index if not exists pacientes_consentimiento_token_unico
  on public.pacientes (consentimiento_token)
  where consentimiento_token is not null;

comment on column public.pacientes.consentimiento_estado is
  'NO_ENVIADO = nunca se le ha mandado. PENDIENTE = tiene el enlace y no ha firmado. FIRMADO = firmado y registrado.';

comment on column public.pacientes.consentimiento_token is
  'Enlace de firma de un solo uso. Aleatorio de 32 bytes; se borra al firmar para que el correo no valga dos veces. Quien lo tiene puede ver el documento sin sesión, así que no se enseña nunca en pantalla.';

comment on column public.pacientes.consentimiento_fecha_envio is
  'Cuándo salió el correo con el enlace. Marca también el inicio de la validez del enlace.';

comment on column public.pacientes.consentimiento_fecha_firma is
  'Cuándo firmó el paciente. Junto con la IP es lo que da valor probatorio a la firma.';

comment on column public.pacientes.consentimiento_firma_data is
  'El trazo de la firma como data URL (image/png en base64). No va a Storage a propósito: así no hay firmas de pacientes accesibles por URL.';

comment on column public.pacientes.consentimiento_ip is
  'IP desde la que se firmó (x-forwarded-for). Trazabilidad, no analítica.';

comment on column public.pacientes.consentimiento_dni is
  'El DNI/NIE tal como lo escribió el paciente al firmar. No se toca aunque luego cambie pacientes.dni: el documento firmado dice lo que decía ese día.';

comment on column public.pacientes.consentimiento_nombre is
  'El nombre tal como lo escribió el paciente al firmar. Nunca pisa pacientes.nombre: la página de firma es pública y no debe poder renombrar a nadie en la agenda.';

comment on column public.pacientes.consentimiento_version is
  'Versión del texto legal que se aceptó (ver src/lib/consentimiento.js). Sin esto no se sabe QUÉ se firmó.';
