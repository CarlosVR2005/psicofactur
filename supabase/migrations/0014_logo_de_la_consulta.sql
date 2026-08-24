-- ---------------------------------------------------------------------
-- 0014 · El logo de la consulta, para la factura
--
-- Se guarda como `data:` URL en una columna de texto, no como fichero
-- en Storage. Tres razones:
--
--  · El PDF se genera en el NAVEGADOR. Con el logo ya en la fila, se
--    dibuja sin pedir nada por red; con Storage haría falta una
--    descarga más que puede fallar. La aplicación se usa como PWA en el
--    móvil de la consulta y conviene que dependa de lo mínimo.
--  · Es un logo: uno, pequeño y que casi nunca cambia. Montar un bucket
--    con sus políticas para eso es más máquina de la que hace falta.
--  · No es un dato sensible, así que no gana nada por estar en un sitio
--    con permisos propios.
--
-- La pantalla lo reescala antes de guardarlo (400 px de ancho máximo),
-- así que la columna se mantiene en unas pocas decenas de KB. El CHECK
-- es la red de seguridad por si alguien intentara meter un tocho por
-- otra vía.
-- ---------------------------------------------------------------------

alter table public.psicologas
  add column if not exists logo text;

comment on column public.psicologas.logo is
  'Logo de la consulta como data: URL (PNG), para imprimirlo en la '
  'factura. Lo reescala la pantalla antes de guardarlo. Null = sin logo.';

alter table public.psicologas
  drop constraint if exists psicologas_logo_razonable;

alter table public.psicologas
  add constraint psicologas_logo_razonable
    check (
      logo is null
      or (logo like 'data:image/%' and length(logo) <= 500000)
    );
