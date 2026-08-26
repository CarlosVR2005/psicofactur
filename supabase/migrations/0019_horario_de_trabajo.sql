-- Migración 0019
--
-- Horario de trabajo de la psicóloga, por día de la semana.
--
-- Sirve para calcular los huecos libres DE VERDAD en la lista de espera:
-- hasta ahora un «hueco liberado» sólo salía de una cita cancelada. Con
-- el horario configurado, cualquier rato dentro de su jornada que no
-- tenga una cita puesta encima cuenta como hueco, se haya cancelado algo
-- ahí o no se haya ocupado nunca.
--
-- Mismo criterio que `google_calendar_config` y `whatsapp_config`: un
-- JSONB que lee y escribe el navegador directamente, con el RLS que ya
-- tiene la tabla (cada psicóloga sólo ve y toca su propia fila). No hace
-- falta ninguna función ni política nueva.
--
-- Forma del JSON (todo lo decide el navegador, aquí no se valida):
--   {
--     "lunes":     { "trabaja": true,  "tramos": [{"desde":"09:00","hasta":"14:00"}, ...] },
--     "martes":    { "trabaja": true,  "tramos": [...] },
--     ...
--     "domingo":   { "trabaja": false, "tramos": [] }
--   }
--
-- Vacío ('{}') = sin configurar todavía: la lista de espera sigue
-- ofreciendo sólo los huecos que deja una cancelación, como hacía antes.

alter table public.psicologas
  add column if not exists horario_trabajo jsonb not null default '{}'::jsonb;

comment on column public.psicologas.horario_trabajo is
  'Horario de trabajo por día de la semana, para calcular huecos libres reales en la lista de espera (no sólo los que deja una cancelación). Vacío = sin configurar.';
