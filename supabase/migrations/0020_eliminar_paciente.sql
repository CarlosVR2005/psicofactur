-- Migración 0020
--
-- Borrar de verdad una ficha de paciente
--
-- Hasta ahora sólo se podía archivar (`activo -> false`), que es lo
-- correcto para el paciente que termina la terapia: su histórico de
-- citas y facturas tiene que seguir existiendo. Pero al importar de otro
-- programa, o de un dedazo, quedan fichas que son basura y que no hay
-- nada que conservar. Eso hay que poder quitarlo.
--
-- Las cascadas ya están puestas desde el principio: al borrar un
-- paciente se van con él sus `citas`, sus `facturas` y sus filas de
-- `lista_espera` (todas con `on delete cascade`), y la fila de
-- `acompanante_id` que le apunte se queda a null. La política
-- `pacientes_delete` ya deja borrar lo propio.
--
-- Lo único que falta —y por lo que esto es una función y no un simple
-- DELETE desde el navegador— es la regla de las facturas: una factura
-- emitida no se puede borrar, la conservan por obligación fiscal y
-- además está declarada en Verifactu. Comprobarlo en la pantalla no
-- basta: la facturación automática de citas pasadas (migración 0015)
-- puede crear una factura justo entre que ella abre el diálogo y
-- confirma. La comprobación tiene que ser atómica con el borrado.
--
-- `security invoker` a propósito: la función corre con los permisos de
-- quien llama, así que el RLS de `pacientes` sigue mandando y nadie
-- puede borrar la ficha de otra consulta.
--
-- No lanza excepción cuando el borrado no procede: devuelve el motivo,
-- igual que `consentimiento-ver` responde 200 con «este enlace no vale».
-- Que una ficha con facturas no se pueda borrar es un final normal de
-- esa pantalla, no un error.
--
--   { "borrado": false, "motivo": "no_encontrado" }
--   { "borrado": false, "motivo": "tiene_facturas", "facturas": n }
--   { "borrado": true,  "citas": n }

create or replace function public.eliminar_paciente(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existe    boolean;
  v_facturas  integer;
  v_citas     integer;
begin
  -- El RLS ya limita esto a las fichas propias: si no es suya, no la ve
  -- y responde igual que si no existiera.
  select exists (select 1 from public.pacientes where id = p_id)
    into v_existe;

  if not v_existe then
    return jsonb_build_object('borrado', false, 'motivo', 'no_encontrado');
  end if;

  select count(*) into v_facturas
    from public.facturas where paciente_id = p_id;

  if v_facturas > 0 then
    return jsonb_build_object(
      'borrado', false,
      'motivo', 'tiene_facturas',
      'facturas', v_facturas
    );
  end if;

  -- Se cuentan antes del borrado para poder decir qué se ha llevado por
  -- delante la cascada.
  select count(*) into v_citas
    from public.citas where paciente_id = p_id;

  delete from public.pacientes where id = p_id;

  return jsonb_build_object('borrado', true, 'citas', v_citas);
end;
$$;

comment on function public.eliminar_paciente(uuid) is
  'Borra una ficha de paciente y, en cascada, sus citas y su lista de espera. Se niega si tiene alguna factura emitida (obligación fiscal / Verifactu): en ese caso hay que archivar. Devuelve jsonb con el resultado, no lanza excepción.';

-- La API REST expone las funciones por /rest/v1/rpc/. Se deja sólo a
-- usuarias con sesión; `anon` no borra pacientes.
revoke execute on function public.eliminar_paciente(uuid) from anon, public;
grant execute on function public.eliminar_paciente(uuid) to authenticated;
