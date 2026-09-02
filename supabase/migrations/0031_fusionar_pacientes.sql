-- Migración 0031
--
-- Fusionar dos fichas de paciente que son la misma persona
--
-- A veces la misma persona acaba con dos fichas porque el nombre no se
-- escribió igual las dos veces («Mª Ángeles Ruiz» / «Ma Angeles Ruiz»).
-- Cada ficha se lleva su parte del histórico: unas citas en una, las
-- facturas en la otra, el consentimiento firmado en la que ya no se usa.
--
-- `eliminar_paciente` (migración 0020) no sirve para juntarlas: sólo
-- borra, y además se niega si hay facturas. Esto es lo contrario: coge
-- una ficha DESTINO (la que se queda) y una o varias de ORIGEN, y
-- reengancha a la destino todo lo que colgaba de las de origen antes de
-- borrarlas.
--
-- `security invoker` a propósito, igual que `eliminar_paciente`: la
-- función corre con los permisos de quien llama, así que el RLS de cada
-- tabla sigue mandando y nadie puede fusionar fichas de otra consulta.
-- Todas las tablas afectadas tienen política de UPDATE con
-- `psicologa_id = auth.uid()`, así que el remapeo pasa el RLS.
--
-- No lanza excepción cuando algo no cuadra: devuelve el motivo, como
-- hace `eliminar_paciente`.
--
--   { "fusionado": false, "motivo": "sin_origenes" | "no_encontrado" }
--   { "fusionado": true, "citas": n, "facturas": n, "entradas": n,
--     "adjuntos": n, "espera": n }
--
-- ----------------------------------------------------------------
-- Por qué esto es seguro para las facturas
--
-- Una factura emitida NO se toca: `facturas` congela a quién se le
-- emitió en `destinatario_nif`, `destinatario_nombre` y
-- `destinatario_domicilio` (migración 0024). Mover `paciente_id` cambia
-- el enlace para navegar, no el documento fiscal. El trigger
-- `asignar_numero_factura` sale por la primera línea cuando
-- `old.emitida_at` ya tiene valor, así que no se renumera nada.
--
-- ----------------------------------------------------------------
-- Los tres choques con índices únicos, y cómo se resuelven
--
--  1. `consentimiento_firmantes` tiene unique (paciente_id, rol). Si
--     destino y origen tienen fila para el mismo rol, el remapeo
--     revienta. Se deja una sola por rol: gana la FIRMADA; si empatan,
--     la de la ficha destino. Una firma real no se pierde nunca.
--
--  2. `lista_espera` tiene unique parcial sobre paciente_id para los
--     estados activos ('esperando', 'avisado'). Se deja una sola fila
--     activa, la que lleve más tiempo esperando; las demás se borran (la
--     lista de espera es transitoria, no hay nada que conservar).
--
--  3. `citas` tiene check (acompanante_id <> paciente_id). Si una ficha
--     es el paciente de una cita y otra el acompañante de esa misma
--     cita, tras la fusión la cita se apuntaría a sí misma. Se le quita
--     el acompañante a esas citas antes de remapear.

create or replace function public.fusionar_pacientes(
  p_destino  uuid,
  p_origenes uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_origenes uuid[];
  v_citas    integer := 0;
  v_facturas integer := 0;
  v_entradas integer := 0;
  v_adjuntos integer := 0;
  v_espera   integer := 0;
begin
  -- Lista de orígenes limpia: sin nulos, sin repetidos y sin el propio
  -- destino colado por error.
  select array_agg(distinct o)
    into v_origenes
    from unnest(p_origenes) as o
   where o is not null and o <> p_destino;

  if v_origenes is null or array_length(v_origenes, 1) is null then
    return jsonb_build_object('fusionado', false, 'motivo', 'sin_origenes');
  end if;

  -- El RLS ya limita esto a las fichas propias: si alguna no es suya, no
  -- la ve y esto responde igual que si no existiera.
  if not exists (select 1 from public.pacientes where id = p_destino) then
    return jsonb_build_object('fusionado', false, 'motivo', 'no_encontrado');
  end if;

  if (
    select count(*) from public.pacientes where id = any(v_origenes)
  ) <> array_length(v_origenes, 1) then
    return jsonb_build_object('fusionado', false, 'motivo', 'no_encontrado');
  end if;

  -- ----------------------------------------------------------------
  -- 1) Rellenar los huecos de la ficha destino con lo que traigan las de
  --    origen. SÓLO huecos: nunca se pisa un dato ya escrito en la
  --    destino. Entre varias fichas de origen gana el primer valor no
  --    vacío por orden de antigüedad (`created_at`).
  --
  --    Misma regla y misma lista de campos que `camposQueCompletan` en
  --    src/lib/pacientesCsv.js: si cambia una, cambia la otra.
  --
  --    `tipo_cliente` y `empresa_*` NO se tocan: el check
  --    `pacientes_empresa_datos` los ata entre sí y mezclarlos a ciegas
  --    dejaría la ficha en un estado incoherente.
  -- ----------------------------------------------------------------
  with o as (
    select
      (array_agg(nullif(btrim(dni), '')           order by created_at) filter (where nullif(btrim(dni), '')           is not null))[1] as dni,
      (array_agg(nullif(btrim(telefono), '')       order by created_at) filter (where nullif(btrim(telefono), '')       is not null))[1] as telefono,
      (array_agg(nullif(btrim(correo), '')         order by created_at) filter (where nullif(btrim(correo), '')         is not null))[1] as correo,
      (array_agg(fecha_nacimiento                  order by created_at) filter (where fecha_nacimiento                  is not null))[1] as fecha_nacimiento,
      (array_agg(inicio_terapia                    order by created_at) filter (where inicio_terapia                    is not null))[1] as inicio_terapia,
      (array_agg(nullif(btrim(observaciones), '')  order by created_at) filter (where nullif(btrim(observaciones), '')  is not null))[1] as observaciones,
      (array_agg(precio_sesion                     order by created_at) filter (where coalesce(precio_sesion, 0) > 0))[1]                as precio_sesion,
      (array_agg(nullif(btrim(progenitor1_nombre), '')   order by created_at) filter (where nullif(btrim(progenitor1_nombre), '')   is not null))[1] as progenitor1_nombre,
      (array_agg(nullif(btrim(progenitor1_dni), '')      order by created_at) filter (where nullif(btrim(progenitor1_dni), '')      is not null))[1] as progenitor1_dni,
      (array_agg(nullif(btrim(progenitor1_correo), '')   order by created_at) filter (where nullif(btrim(progenitor1_correo), '')   is not null))[1] as progenitor1_correo,
      (array_agg(nullif(btrim(progenitor1_telefono), '') order by created_at) filter (where nullif(btrim(progenitor1_telefono), '') is not null))[1] as progenitor1_telefono,
      (array_agg(nullif(btrim(progenitor2_nombre), '')   order by created_at) filter (where nullif(btrim(progenitor2_nombre), '')   is not null))[1] as progenitor2_nombre,
      (array_agg(nullif(btrim(progenitor2_dni), '')      order by created_at) filter (where nullif(btrim(progenitor2_dni), '')      is not null))[1] as progenitor2_dni,
      (array_agg(nullif(btrim(progenitor2_correo), '')   order by created_at) filter (where nullif(btrim(progenitor2_correo), '')   is not null))[1] as progenitor2_correo,
      (array_agg(nullif(btrim(progenitor2_telefono), '') order by created_at) filter (where nullif(btrim(progenitor2_telefono), '') is not null))[1] as progenitor2_telefono
    from public.pacientes
    where id = any(v_origenes)
  )
  update public.pacientes d set
    dni                  = coalesce(nullif(btrim(d.dni), ''),                  o.dni),
    telefono             = coalesce(nullif(btrim(d.telefono), ''),             o.telefono),
    correo               = coalesce(nullif(btrim(d.correo), ''),               o.correo),
    fecha_nacimiento     = coalesce(d.fecha_nacimiento,                        o.fecha_nacimiento),
    inicio_terapia       = coalesce(d.inicio_terapia,                          o.inicio_terapia),
    observaciones        = coalesce(nullif(btrim(d.observaciones), ''),        o.observaciones),
    precio_sesion        = case when coalesce(d.precio_sesion, 0) > 0
                                then d.precio_sesion
                                else coalesce(o.precio_sesion, d.precio_sesion) end,
    progenitor1_nombre   = coalesce(nullif(btrim(d.progenitor1_nombre), ''),   o.progenitor1_nombre),
    progenitor1_dni      = coalesce(nullif(btrim(d.progenitor1_dni), ''),      o.progenitor1_dni),
    progenitor1_correo   = coalesce(nullif(btrim(d.progenitor1_correo), ''),   o.progenitor1_correo),
    progenitor1_telefono = coalesce(nullif(btrim(d.progenitor1_telefono), ''), o.progenitor1_telefono),
    progenitor2_nombre   = coalesce(nullif(btrim(d.progenitor2_nombre), ''),   o.progenitor2_nombre),
    progenitor2_dni      = coalesce(nullif(btrim(d.progenitor2_dni), ''),      o.progenitor2_dni),
    progenitor2_correo   = coalesce(nullif(btrim(d.progenitor2_correo), ''),   o.progenitor2_correo),
    progenitor2_telefono = coalesce(nullif(btrim(d.progenitor2_telefono), ''), o.progenitor2_telefono)
  from o
  where d.id = p_destino;

  -- ----------------------------------------------------------------
  -- 2) Consentimiento: una sola fila por rol entre destino y orígenes.
  --    Gana la FIRMADA; si empatan, la más reciente y, en último
  --    término, la de la ficha destino. Se borran las perdedoras (estén
  --    donde estén). El trigger `refrescar_consentimiento_resumen` deja
  --    el resumen de la ficha destino coherente por su cuenta.
  -- ----------------------------------------------------------------
  with todas as (
    select id, rol, estado, fecha_firma, created_at,
           (paciente_id = p_destino) as es_destino
      from public.consentimiento_firmantes
     where paciente_id = p_destino
        or paciente_id = any(v_origenes)
  ),
  ganadora as (
    select distinct on (rol) id
      from todas
     order by rol,
              (estado = 'FIRMADO') desc,
              fecha_firma desc nulls last,
              es_destino desc,
              created_at
  )
  delete from public.consentimiento_firmantes
   where id in (select id from todas)
     and id not in (select id from ganadora);

  -- ----------------------------------------------------------------
  -- 3) Lista de espera: deja una sola fila activa, la que lleve más
  --    tiempo en cola. Las demás filas activas de las fichas de origen
  --    se borran.
  -- ----------------------------------------------------------------
  delete from public.lista_espera x
   where x.paciente_id = any(v_origenes)
     and x.estado in ('esperando', 'avisado')
     and x.id <> (
       select w.id
         from public.lista_espera w
        where w.estado in ('esperando', 'avisado')
          and (w.paciente_id = p_destino or w.paciente_id = any(v_origenes))
        order by w.created_at, w.id
        limit 1
     );

  -- ----------------------------------------------------------------
  -- 4) Citas donde una ficha es el paciente y otra el acompañante: se
  --    quita el acompañante para no chocar con el check.
  -- ----------------------------------------------------------------
  update public.citas
     set acompanante_id = null
   where (paciente_id = p_destino or paciente_id = any(v_origenes))
     and (acompanante_id = p_destino or acompanante_id = any(v_origenes));

  -- ----------------------------------------------------------------
  -- 5) Contar lo que se va a mover, para el aviso de después.
  -- ----------------------------------------------------------------
  select count(*) into v_citas    from public.citas             where paciente_id = any(v_origenes);
  select count(*) into v_facturas from public.facturas          where paciente_id = any(v_origenes);
  select count(*) into v_entradas from public.historia_entradas where paciente_id = any(v_origenes);
  select count(*) into v_adjuntos from public.historia_adjuntos where paciente_id = any(v_origenes);
  select count(*) into v_espera   from public.lista_espera      where paciente_id = any(v_origenes);

  -- ----------------------------------------------------------------
  -- 6) Remapear todo lo que apunta a `pacientes.id`.
  --    (`recordatorios_whatsapp` cuelga de `citas`, así que va sola.
  --    Los ficheros del bucket `historia` no se mueven: su ruta lleva
  --    dentro el paciente_id viejo, pero es sólo una clave de Storage;
  --    la fila de `historia_adjuntos` sí queda apuntando a la destino,
  --    que es por donde se listan y se borran.)
  -- ----------------------------------------------------------------
  update public.citas             set paciente_id    = p_destino where paciente_id    = any(v_origenes);
  update public.citas             set acompanante_id = p_destino where acompanante_id = any(v_origenes);
  update public.facturas          set paciente_id    = p_destino where paciente_id    = any(v_origenes);
  update public.historia_entradas set paciente_id    = p_destino where paciente_id    = any(v_origenes);
  update public.historia_adjuntos set paciente_id    = p_destino where paciente_id    = any(v_origenes);
  update public.lista_espera      set paciente_id    = p_destino where paciente_id    = any(v_origenes);
  update public.consentimiento_firmantes set paciente_id = p_destino where paciente_id = any(v_origenes);

  -- ----------------------------------------------------------------
  -- 7) Borrar las fichas de origen. Ya no les cuelga nada, así que la
  --    cascada no se lleva nada por delante.
  -- ----------------------------------------------------------------
  delete from public.pacientes where id = any(v_origenes);

  return jsonb_build_object(
    'fusionado', true,
    'citas',    v_citas,
    'facturas', v_facturas,
    'entradas', v_entradas,
    'adjuntos', v_adjuntos,
    'espera',   v_espera
  );
end;
$$;

comment on function public.fusionar_pacientes(uuid, uuid[]) is
  'Fusiona una o varias fichas de paciente (p_origenes) en una ficha destino: rellena los huecos de la destino, reengancha citas, facturas, historia clínica, lista de espera y consentimiento, y borra las de origen. Devuelve jsonb con el resultado, no lanza excepción.';

-- La API REST expone las funciones por /rest/v1/rpc/. Se deja sólo a
-- usuarias con sesión; `anon` no fusiona pacientes.
revoke execute on function public.fusionar_pacientes(uuid, uuid[]) from anon, public;
grant  execute on function public.fusionar_pacientes(uuid, uuid[]) to authenticated;
