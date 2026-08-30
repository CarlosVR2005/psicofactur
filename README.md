# Psicofactur

PWA para la gestión de una consulta de psicología: **pacientes, calendario,
facturación y recordatorios de WhatsApp**.

> **Las cuatro secciones funcionan contra Supabase**, con login y RLS. No
> queda ni un dato de ejemplo en el código. Las integraciones externas
> (Google Calendar, WhatsApp Business, Veri\*Factu) son la fase siguiente.

## Arrancar

```bash
npm install
npm run dev
```

Se abre en http://localhost:5173

Antes de la primera ejecución: copia `.env.example` como `.env` y rellena
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings →
API). Vite sólo pasa al navegador las variables con prefijo `VITE_`; si cambias
el `.env` hay que reiniciar `npm run dev`.

## Base de datos y sesión

- Esquema: lo aplica `schema.sql` (ejecutado a mano en el SQL Editor) más las
  migraciones de `supabase/migrations/`.
- Multi-tenant: cada tabla lleva `psicologa_id` y las políticas RLS filtran por
  `psicologa_id = auth.uid()`. La clave `anon` del `.env` es pública a
  propósito; lo que protege los datos es el RLS.
- **Alta de la psicóloga:** `psicologas` no tiene política de INSERT. La fila la
  crea el trigger `on_auth_user_created` → `handle_new_user()`, en
  `SECURITY DEFINER`. Así el alta es automática al registrar el usuario y nadie
  puede inventarse filas desde el cliente.
- **Crear el primer usuario:** Supabase → Authentication → Users → _Add user_
  (marcando _Auto Confirm User_). Al guardarlo aparece sola su fila en
  `psicologas`.
- `estado_confirmacion` de una cita **casi nunca se escribe desde el frontend**:
  lo pone la sincronización con Google leyendo el círculo de color que
  **Confirmafy** antepone al título del evento (🟢 confirmada · 🟡 pendiente ·
  🔴 cancelada), y antes lo ponía el trigger de `recordatorios_whatsapp`. La app
  lo lee y lo escucha por Realtime. Única excepción: al **reprogramar** una cita
  que el paciente había cancelado, el frontend la devuelve a `pendiente`
  (`actualizarCita(..., { reactivar: true })`).

Otros comandos:

```bash
npm run build
npm run preview
```

## Instalarla como aplicación

- **Escritorio (Chrome/Edge):** icono de instalar en la barra de direcciones →
  _Instalar Psicofactur_.
- **iPhone (Safari):** Compartir → _Añadir a pantalla de inicio_. Se abre a
  pantalla completa, sin barra del navegador.

Para probarlo en el iPhone hace falta servirla por **HTTPS** (Safari sólo
registra el service worker en https o en localhost). Lo más cómodo es publicar
la carpeta `dist/` en Vercel o Netlify.

## Estructura

```
src/
├─ index.css              Sistema de diseño: paleta, tipografía, tokens.
│                         Tocando aquí cambia el aspecto de toda la app.
├─ lib/
│   ├─ supabase.js        cliente único de Supabase
│   ├─ tipos.js           tipos de cita y estados (espejo de los ENUM)
│   ├─ fechas.js          calendario en español
│   ├─ espera.js          cuándo un hueco liberado le sirve a quien espera
│   ├─ consentimiento.js  el texto legal que firma el paciente, con VERSIÓN
│   ├─ csv.js             leer y escribir CSV (separador, comillas, BOM)
│   ├─ xlsx.js            leer un Excel .xlsx sin librerías (ZIP + XML)
│   ├─ pacientesCsv.js    traspaso de pacientes: abrir el archivo venga
│   │                     como venga, alias de columnas, fechas y
│   │                     teléfonos de cualquier programa, duplicados
│   └─ formato.js         €, teléfono, DNI, búsqueda sin tildes
├─ services/              ACCESO A DATOS (lo único que habla con Supabase)
│   ├─ base.js            patrón { data, error } y traducción de errores
│   ├─ pacientes.js       getPacientes · getPaciente · crearPaciente ·
│   │                     actualizarPaciente · cambiarActivo ·
│   │                     crearPacientesEnLote · completarPacientesEnLote
│   ├─ citas.js           getCitas · getCitasDePaciente · crearCita ·
│   │                     actualizarCita · eliminarCita · suscribirCitas
│   ├─ facturas.js        getFacturas · getFacturasDePaciente ·
│   │                     getSesionesSinFacturar · facturarSesion ·
│   │                     facturarSesionesPendientes · editarBorradorFactura ·
│   │                     cambiarMetodoPago · cambiarEstadoPago
│   ├─ recordatorios.js   getProximasConRecordatorio · enviarPorWhatsApp ·
│   │                     registrarEnvio · enlaceWhatsApp · marcarRespuesta
│   ├─ googleCalendar.js  conectar · desconectar · sincronizarCita
│   │                     (LA COSTURA de la integración: detrás hay Edge
│   │                     Functions y nadie más se entera)
│   ├─ eventosPendientes.js  bandeja de la importación de Google
│   ├─ listaEspera.js     getListaEspera · getHuecosLiberados ·
│   │                     anadirAEspera · cambiarEstadoEspera
│   ├─ correo.js          enviarFacturaPorEmail (LA COSTURA del envío:
│   │                     detrás hay una Edge Function y Brevo)
│   ├─ consentimiento.js  enviarConsentimiento (con sesión) ·
│   │                     getConsentimiento · firmarConsentimiento
│   │                     (SIN sesión: las usa el paciente) ·
│   │                     getFirmaConsentimiento
│   └─ ajustes.js         configuración de la psicóloga (JSONB)
├─ hooks/                 usePacientes · useCitas · useFacturas ·
│                         useRecordatorios · useListaEspera (carga,
│                         error, recarga y escucha en vivo)
├─ store/AuthContext.jsx  sesión + fila de `psicologas`
├─ components/
│   ├─ ui/                Badge · Card · Boton · Modal · Campo · Buscador ·
│   │                     Avatar · Segmentado · EstadoVacio · Cargando ·
│   │                     AvisoError
│   └─ layout/            AppLayout · Sidebar · TabBar · Cabecera · Marca ·
│                         RutaProtegida
├─ features/
│   ├─ pacientes/         PacienteCard · PacienteModal · DatoFicha ·
│   │                     ImportarExportarModal · ConsentimientoCard ·
│   │                     ConsentimientoBadge · FirmaModal
│   ├─ consentimiento/    LienzoFirma (el <canvas>) · TextoLegal
│   │                     (lo que ve el PACIENTE, sin sesión)
│   ├─ agenda/            VistaSemana · VistaMes · CitaChip · CitaModal ·
│   │                     TipoCitaBadge · EventoPendiente
│   ├─ facturacion/       FacturaFila · EstadoPagoBadge · MetodoPagoBoton ·
│   │                     BotonEmitir · BotonPDF · BotonEnviarEmail ·
│   │                     RectificarModal · EditarFacturaModal ·
│   │                     pdfFactura.js (el documento) ·
│   │                     datosPdfFactura.js (lo que lleva, en común
│   │                     entre descargar y enviar)
│   ├─ recordatorios/     RecordatorioCard · EstadoConfirmacionBadge
│   ├─ espera/            EsperaFila · EsperaModal · HuecoLiberado
│   └─ ajustes/           ConexionGoogle · ConexionWhatsApp
└─ pages/                 LoginPage + una por sección + ficha del paciente
                         + AjustesPage + RevisarEventosPage
                         + ListaEsperaPage
                         + ConsentimientoPage (PÚBLICA: la abre el
                           paciente desde su correo, sin sesión)

supabase/
├─ migrations/            SQL aplicado al proyecto, en orden
└─ functions/             Edge Functions (Deno)
    ├─ _shared/           google.ts (OAuth y tokens) · whatsapp.ts (Meta) ·
    │                     verifacti.ts (AEAT) · email.ts (Brevo) ·
    │                     recordatorio.ts (componer y anotar) ·
    │                     consentimiento.ts (token, caducidad y correo) ·
    │                     supabase.ts · cors.ts
    ├─ google-oauth-start/
    ├─ google-oauth-callback/
    ├─ google-desconectar/
    ├─ sync-cita-a-google/
    ├─ sincronizar-desde-google/
    ├─ enviar-recordatorio-whatsapp/      a mano, desde la pantalla
    ├─ enviar-recordatorios-automaticos/  solos, por el cron de cada hora
    ├─ enviar-factura-email/              la factura en PDF al paciente
    ├─ enviar-consentimiento/             el enlace de firma al paciente
    ├─ consentimiento-ver/                SIN sesión: manda el token
    ├─ consentimiento-firmar/             SIN sesión: manda el token
    └─ webhook-whatsapp/
```

## Google Calendar

El permiso de Google es **independiente del login**: la psicóloga sigue
entrando con su email y contraseña, y por separado autoriza el acceso a su
calendario desde **Ajustes**. Toda la conversación con Google ocurre en el
servidor (Edge Functions); el navegador no ve ningún token.

### Dónde vive cada cosa

| | |
|---|---|
| `psicologas.google_calendar_config` | Estado visible: `conectado`, `email`, `mostrarNombre`, `necesitaReconectar`. Lo lee la pantalla de Ajustes. |
| `google_credenciales` | Los tokens. RLS **sin políticas**: no existe para el navegador. Sólo las Edge Functions (clave de servicio) llegan aquí. |
| Supabase Vault | Dentro de esa tabla no está el token, sino el id de un secreto cifrado. |
| Secretos de Edge Functions | `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. **Nunca** en el `.env` del navegador. |

Tres capas porque un refresh token de Google **no caduca**: quien lo tenga
puede entrar en el calendario para siempre.

### Configuración, una única vez (la hace Carlos)

En [Google Cloud Console](https://console.cloud.google.com):

1. Proyecto con la **Google Calendar API** habilitada.
2. **Pantalla de consentimiento OAuth →** tipo *Externo*, con **los dos**
   correos en *Usuarios de prueba*: el de la psicóloga y el tuyo, para poder
   probar sin tocar su calendario. Sale un aviso de «aplicación no verificada»
   que hay que aceptar en *Configuración avanzada*: es esperable, no un error.

   > **Importante antes de dárselo a ella:** mientras el estado de publicación
   > sea *Prueba*, Google caduca los refresh tokens **a los 7 días**. Se
   > notaría como una desconexión sola cada semana (Ajustes lo avisaría con
   > «Volver a conectar», pero es un incordio). Con la app en **producción**
   > el refresh token no caduca. Publicarla no exige pasar la verificación de
   > Google: sólo se sigue viendo el aviso de app no verificada al conectar,
   > una única vez.
3. **Credenciales → ID de cliente de OAuth → Aplicación web**, con esta **URI
   de redirección autorizada** (exactamente ésta, es la Edge Function, no el
   callback de Supabase Auth):

   ```
   https://ozmwivoatmzqonqykuuy.supabase.co/functions/v1/google-oauth-callback
   ```

En Supabase (**Edge Functions → Secrets**):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APP_ORIGENES=https://dominio-de-produccion   # localhost va permitido siempre
```

### Cómo se conecta ella

Ajustes → **Conectar**. La app se va a la pantalla de Google, ella acepta y
vuelve a Ajustes, que ya dice *Conectado como su-correo@gmail.com*. Nada más.

Sólo puede haber **una cuenta de Google conectada a la vez** por cuenta de
Psicofactur: conectar otra reemplaza la anterior. Por eso se puede probar con
la cuenta de Google de Carlos (los eventos caen en su calendario) y luego
*Desconectar* y conectar la de ella, sin tocar nada más.

Los permisos que se piden son el mínimo: `calendar.events` (crear y editar
eventos, sin ver el resto del calendario) y `openid email`, sólo para poder
enseñar de qué cuenta se trata.

### El flujo, por dentro

```
Ajustes ─► google-oauth-start ─► (state de un solo uso, 10 min)
        ─► pantalla de Google ─► google-oauth-callback
        ─► tokens a Vault ─► vuelta a /ajustes?google=ok
```

`google-oauth-callback` se despliega **sin verificación de JWT**: quien la
llama es una redirección del navegador que viene de Google, sin sesión de
Supabase. Lo que autentica la petición es el `state`, que generamos nosotros,
vale para un solo uso y dice de quién es la autorización.

`_shared/google.ts` tiene `accessTokenValido()`, que renueva el access token
con el refresh token cuando le queda menos de un minuto. La usan todas las
Edge Functions; nadie más habla con el endpoint de tokens de Google. Si Google
responde `invalid_grant` (ella revocó el acceso desde su cuenta), se marca
`necesitaReconectar` y Ajustes lo enseña: **nada de fallos silenciosos**.

### Privacidad

La casilla *Incluir el nombre del paciente* decide si el evento se llama
«Sesión · Lucía Fernández» o sólo «Sesión». Al paciente no se le añade nunca
como invitado, así que Google no le manda nada.

### Las citas en el calendario

Crear, editar o borrar una cita en la app se refleja en Google Calendar a
través de `sync-cita-a-google`, que llama el navegador **justo después** de
guardar en Supabase.

Por qué desde el navegador y no con un trigger de base de datos: con trigger,
el día que la sincronización Google → app escriba en `citas` se montaría un
bucle (la app avisa a Google, Google avisa a la app…). Disparando desde el
navegador sólo se sincroniza lo que se toca a mano, y el fallo se ve en
pantalla en vez de morirse en un log.

Del navegador sólo viaja **qué cita** y **qué acción**; el contenido del evento
lo arma la Edge Function leyendo la base de datos con el RLS de la usuaria
puesto. Detalles:

- Si Google falla, la cita **ya está guardada** en Supabase: sólo sale un aviso
  de que no se pudo pasar al calendario.
- Si ella borró el evento en Google y luego edita la cita en la app, se crea
  uno nuevo en vez de dejarla desincronizada para siempre.
- `citas.google_event_id` lo escribe **sólo** la Edge Function. El frontend no
  lo toca: si `aFila()` lo incluyera, cada edición borraría el vínculo.
- En el calendario, las citas que están en Google llevan un ✓ verde.
- Cada evento lleva escondido el id de la cita
  (`extendedProperties.private.psicofacturCitaId`), que servirá para
  reconocerlo en la sincronización de vuelta.

### Los cambios hechos en Google

Si mueve o borra una cita directamente en su Google Calendar, la app se entera
sola. `sincronizar-desde-google` le pide a Google la lista de eventos con un
`syncToken`: Google devuelve **sólo lo que ha cambiado** desde la última vez,
más un token nuevo para la siguiente. La primera vez no hay token y se hace una
pasada completa de 90 días hacia atrás y un año hacia delante; si el token se
invalida, Google responde 410 y se repite la pasada entera.

Qué hace con cada cambio:

| En Google | En la app |
|---|---|
| Cambió la hora o la duración | Se actualiza `fecha_hora` / `duracion_minutos` |
| El título empieza por un círculo de **Confirmafy** (🟢/🟡/🔴) | Se pone `estado_confirmacion` a `confirmada` / `pendiente` / `cancelada`. El círculo no se toca nunca. Sin círculo, el estado se deja como estaba |
| Se borró el evento | La cita pasa a **cancelada** y se suelta el `google_event_id`. No se borra la fila: hay facturas colgando de las citas |
| Se convirtió en evento de todo el día | Se deja como está: una sesión sin hora no tiene sentido |
| Evento nuevo que no salió de la app | Se intenta importar (ver abajo) — salvo que lo lleve el círculo 🔴, que es un hueco libre, no una sesión |

### Importar lo que nace en Google

**Manda Google.** Su madre lleva años trabajando en su calendario y usa las
páginas de reserva, así que hay pacientes que entran solos sin pasar por la
app. Importar a lo bruto crearía pacientes llamados «Dentista», así que el
criterio es el título del evento:

| Título del evento | Qué se hace |
|---|---|
| `Nombre +34 600 11 22 33` | Cita. Se busca al paciente por los **nueve últimos dígitos** del teléfono y, si no está, se le crea la ficha |
| `Horarios para cita (Nombre Apellido)` | Cita. Es una reserva hecha desde su página; se busca al paciente **por nombre**, sin tildes ni espacios de más |
| `Dentista`, `Cita urólogo`, `Adrian alvarez` | A `eventos_google_pendientes`, **pendiente**: ella dirá si es una cita y de quién |
| `Cerrado`, `Horarios para cita` a secas, `304`, `320 €` | A esa tabla ya **ignorado**. Los números sueltos son la caja del día, que ella se apunta |
| Segundo evento a la misma hora | Se descarta: cada sesión aparece dos veces en su calendario |

Detalles que costaron un intento fallido y conviene no volver a perder:

- **Los emojis se quitan del nombre.** Ella marca los eventos con 🟢 y 🔴, y
  sin limpiarlos las fichas se llamaban «🟢 Mónica Sotellino».
- **Hay tope hacia delante** (`DIAS_ADELANTE`, un año). Sin él, al expandir los
  eventos repetitivos Google devuelve años de futuro y la bandeja se llena de
  citas de 2028.
- **`pacientes.creado_desde = 'google'`** marca las fichas creadas al importar:
  van a medias, sin DNI ni precio de sesión.
- Si se pasa de `MAXIMO_POR_VUELTA` altas, **no se guarda el punto de control**,
  así que la vuelta siguiente repite la pasada y sigue donde iba sin duplicar.

### La bandeja: `/revisar`

Lo que queda en `pendiente` se resuelve en **Eventos por revisar**, a la que se
llega desde el aviso que sale en el Calendario cuando hay alguno. Por cada
evento, dos salidas:

- **«Sí es una cita»** → buscador de pacientes con el nombre del título ya
  escrito. Si el paciente no tiene ficha, se crea desde ahí mismo (a medias:
  sin DNI ni precio) y se enlaza la cita al evento de Google.
- **«No es una cita»** → pasa a `ignorado` y no vuelve a preguntarse. Las filas
  no se borran nunca: si se borraran, la siguiente sincronización traería el
  mismo evento otra vez, para siempre.

La cita que sale de aquí lleva su `google_event_id`, así que a partir de ese
momento las dos agendas van juntas.

> Consecuencia que conviene tener presente: si más adelante se **edita** en la
> app una cita importada, la sincronización app→Google reescribe el título del
> evento como «Sesión · Nombre». El título original que ella hubiera puesto se
> pierde.

Como `citas` está en Realtime, el calendario se repinta solo cuando llegan los
cambios, sin recargar.

**Quién la dispara.** La misma función sirve para los dos casos, y distingue
por el `role` del token (la plataforma ya lo ha validado antes de entrar):

- El **cron cada 10 minutos**, con la clave de servicio → todas las psicólogas
  conectadas.
- El botón **«Traer ahora»** de Ajustes, con la sesión de ella → sólo la suya.

**Para que el cron funcione** hay que guardar la clave de servicio en Vault una
sola vez, desde el editor SQL de Supabase (no está en ningún archivo del
proyecto):

```sql
select vault.create_secret(
  'PEGA_AQUI_LA_SERVICE_ROLE_KEY',
  'clave_servicio_supabase',
  'Clave de servicio para que el cron llame a las Edge Functions'
);
```

El botón «Traer ahora» funciona sin eso; el que necesita la clave es el reloj.

Para ver cómo le va al cron:

```sql
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'psicofactur-google-sondeo')
order by start_time desc limit 10;
```

### Pendiente

El webhook *push* de Google, cuando haya dominio propio verificado. No cambia
el motor: la notificación de Google no lleva datos, así que llamaría a esta
misma función; sólo se ahorraría la espera. Las columnas `canal_*` de
`google_credenciales` ya están puestas para eso.

## Recordatorios de WhatsApp

La pantalla de Recordatorios funciona de dos formas, y la elige el
interruptor **Enviar solo** de Ajustes:

| | Sin la API (por defecto) | Con la API |
|---|---|---|
| Al pulsar *Enviar* | Se abre WhatsApp con el mensaje escrito y ella lo manda | Sale solo desde el servidor |
| Sin pulsar nada | — | Sale solo 24 h antes de cada cita |
| Cuando el paciente contesta | Ella lo marca con ✓ o ✕ | Entra solo por el webhook, y se le acusa recibo |
| Coste | Gratis | Céntimos por mensaje |
| Hace falta | Nada | Número dedicado, cuenta de Meta y plantilla aprobada |

El modo manual **no desaparece**: si Meta falla, si un número no tiene
WhatsApp o si el paciente contesta por teléfono, los botones ✓ y ✕ siguen
ahí. Y los dos caminos escriben en el mismo sitio —
`recordatorios_whatsapp.boton_pulsado` — de modo que es siempre el trigger
`sync_estado_confirmacion` quien cambia el estado de la cita por esta vía. El
frontend sólo escribe `citas.estado_confirmacion` al **reprogramar** una cita
cancelada (la devuelve a `pendiente`); lo demás lo llevan este trigger y la
sincronización con Google (los círculos de Confirmafy, ver arriba).

### Lo que hay que montar en Meta (una vez)

1. **Un número de teléfono que NO esté en WhatsApp.** Ni en el WhatsApp
   normal ni en WhatsApp Business. Sirve el **fijo de la consulta** (se
   verifica por llamada de voz) o una SIM prepago. **No usar el número
   personal de la psicóloga**: perdería su WhatsApp del móvil.
2. Cuenta de **Meta Business** + una app en **Meta for Developers** con el
   producto *WhatsApp* añadido.
3. Un **token permanente de usuario de sistema** con permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`.
4. La **plantilla**, categoría *Utility*, nombre `recordatorio_cita`,
   idioma `es`, con tres variables y dos botones de respuesta rápida:

   ```
   Hola {{1}}, te recordamos tu cita del {{2}} a las {{3}}.
   [ Sí, confirmo ]  [ No puedo ]
   ```

   **El orden de los botones importa.** Al mandar la plantilla, cada botón
   sale con el id de la cita dentro (`CONFIRMAR_CITA_<id>` el primero,
   `CANCELAR_CITA_<id>` el segundo), y eso es lo que permite al webhook
   saber de qué cita habla el paciente aunque WhatsApp no adjunte el
   mensaje citado. Si algún día se reordenan en Meta, hay que reordenar
   los índices en `_shared/whatsapp.ts`.

   Como red de seguridad, el webhook sigue mirando **también el texto**
   («sí», «confirmo», «no puedo»…), que es lo que salva las respuestas
   escritas a mano y los recordatorios mandados por `wa.me`.
5. **El webhook**, en la app de Meta → WhatsApp → Configuración:

   ```
   URL:   https://ozmwivoatmzqonqykuuy.supabase.co/functions/v1/webhook-whatsapp
   Token: el mismo valor que WHATSAPP_VERIFY_TOKEN
   ```

   Y suscribirse a los campos **`messages`** (trae respuestas y estados).

### Secretos (Supabase → Edge Functions → Secrets)

```
WHATSAPP_TOKEN            token permanente del usuario de sistema
WHATSAPP_PHONE_NUMBER_ID  el ID del número, no el número
WHATSAPP_VERIFY_TOKEN     una frase inventada, la misma que en Meta
WHATSAPP_APP_SECRET       secreto de la app, para validar la firma
WHATSAPP_API_VERSION      opcional (por defecto v21.0)
```

Ninguno va al `.env` del navegador ni a una tabla. Ajustes sólo pregunta
al servidor si los tiene puestos, y si falta alguno lo dice por su nombre.

### Seguridad del webhook

Está abierto a internet (Meta no manda sesión de Supabase), así que se
despliega con `verify_jwt = false` y lo que autentica cada aviso es la
firma **`X-Hub-Signature-256`**: un HMAC-SHA256 del cuerpo con el secreto
de la app. Se calcula sobre el cuerpo **tal cual llegó** — por eso el
código lee `req.text()` y no `req.json()`. Sin firma válida no se toca la
base de datos.

### Privacidad

Al mensaje sólo van **el nombre de pila, la fecha y la hora**. Ni el tipo
de sesión, ni las notas, ni nada clínico: es un mensaje que pasa por los
servidores de Meta. Al paciente no se le añade nunca como invitado a nada
y no recibe más que ese recordatorio.

### El envío automático

Con el interruptor *Enviar solo* encendido, el recordatorio sale sin que
ella haga nada. Lo mueve el mismo patrón `pg_cron` + `pg_net` que el
sondeo de Google (migración `0008`):

```
cada hora (minuto 5)
  └─ public.whatsapp_recordar()          saca la clave de servicio de Vault
      └─ enviar-recordatorios-automaticos
          ├─ ¿qué consultas tienen whatsapp_config.activo = true?
          ├─ sus citas entre 23 h y 24 h desde ahora, aún `pendiente`
          └─ por cada una: apuntar la fila → mandar la plantilla → cerrarla
```

**Por qué una ventana de una hora y no «las citas de mañana».** La
ventana va de `horasAntes - 1` a `horasAntes`, justo lo que separa dos
vueltas del cron, así que cada cita entra en una única vuelta y el aviso
le llega al paciente a su misma hora del día anterior — no a todos a las
ocho de la mañana. Y como de noche no hay citas, de noche no sale ningún
mensaje: no hacen falta horas de silencio.

**Por qué no hay `citas.recordatorio_enviado`.** Sería un duplicado de lo
que ya dice el histórico, y un booleano aparte se desincroniza el primer
día que un envío falle a medias. Lo que impide el duplicado es el índice
único `recordatorios_whatsapp_auto_unica` (una fila `origen =
'automatico'` por cita) más el orden del envío: **primero se apunta la
fila y después se llama a Meta**, de modo que si dos vueltas se solapan,
la segunda choca contra el índice y se retira sin mandar nada. Al revés,
el cerrojo llegaría tarde y el paciente ya tendría dos mensajes.

Una cita que se pierda una vuelta (función caída, Meta caído) ya no
vuelve a entrar en la ventana. Es el precio de no arriesgarse a avisar
dos veces, y se ve enseguida: en la pantalla sigue diciendo «Sin enviar»
y el botón *Enviar* está ahí.

**Qué se salta:** las citas ya `confirmada` o `cancelada`, las que ya
tienen recordatorio automático y las fichas sin teléfono válido (esas
quedan anotadas como fallidas, con el motivo, para que se vean).

**Puesta en marcha, y en este orden.** Primero la migración `0008` en el
editor SQL: las funciones escriben ya la columna `origen`, así que si se
despliegan antes, el envío a mano deja de anotar. La migración necesita
el secreto `clave_servicio_supabase` en Vault, el mismo que ya usa el
sondeo de Google: si aquello funciona, esto arranca solo.

Y después:

```bash
supabase functions deploy enviar-recordatorios-automaticos
supabase functions deploy enviar-recordatorio-whatsapp
supabase functions deploy webhook-whatsapp --no-verify-jwt
```

Para probarlo sin esperar al reloj, desde el editor SQL:

```sql
select public.whatsapp_recordar();
```

Manda **de verdad** los recordatorios que toquen en ese momento.

### El acuse de recibo

Cuando el paciente pulsa un botón, el webhook le contesta («✅ Tu cita ha
quedado confirmada»). Es un texto suelto, no una plantilla, y se puede
porque el paciente acaba de escribir: eso abre la ventana de 24 h de
Meta. Se apaga desde Ajustes (`whatsapp_config.acuse`).

### Pendiente

Nada del código: sigue faltando lo de fuera (número dedicado, cuenta de
Meta y plantilla aprobada), que es lo que impide probar la cadena entera
contra un teléfono real.

## La factura por correo

El botón del sobre, en cada factura de la lista, le manda al paciente su
factura en PDF al correo que tenga en la ficha. Tiene cuatro caras:

| Situación | Qué se ve |
|---|---|
| Hacienda aún no la ha aceptado | **nada**: no hay botón |
| Aceptada y sin enviar | sobre gris → la manda |
| Ya enviada | sobre **verde**, y pide confirmación antes de reenviarla |
| El paciente no tiene correo | sobre ámbar → lleva a su ficha a ponérselo |

### Por qué Brevo y no Resend

Por dónde acaban los datos, no por precio ni por comodidad. En estos correos
viajan direcciones de pacientes y asuntos con el número de su factura: el
rastro de quién va a una consulta de psicología. **Brevo aloja todo eso en la
UE** (Francia, Alemania y Bélgica). Resend despacha desde Irlanda si se le
pide, pero los logs y metadatos se le quedan en Estados Unidos.

De propina, el margen gratis es mayor (300/día frente a 3.000/mes) y añade el
DMARC que el dominio no tenía. El trabajo de DNS es el mismo en las dos.

### Lo que falta para que funcione

El código está entero; falta dar de alta la cuenta de Brevo. El dominio es
**psicologaenlanzarote.com**, registrado en DonDominio.

**Ojo con una cosa antes de tocar el DNS.** Ese dominio YA tiene correo
funcionando: `MX → mx.serviciodecorreo.es` y un SPF propio
(`v=spf1 include:_spf.serviciodecorreo.es ~all`). Dos registros SPF en el
mismo nombre invalidan los dos y tumbarían el correo de la consulta, así que
**el SPF de la raíz no se toca**. No hace falta: Brevo no pide SPF.

1. Crear cuenta en [brevo.com](https://www.brevo.com) → Senders, Domains &
   Dedicated IPs → Domains → añadir `psicologaenlanzarote.com`.

   La autenticación automática de Brevo **no sirve aquí**: no reconoce a
   DonDominio. Hay que pegar los registros a mano.

2. En el panel DNS de DonDominio, los registros que dé Brevo. Los que pidió
   en agosto de 2026, ya puestos y verificados:

   | Tipo | Nombre | Qué es |
   |---|---|---|
   | TXT | `@` (la raíz) | el `brevo-code`, para probar que el dominio es tuyo |
   | TXT | `brevo1._domainkey` | clave DKIM (par rotatorio) |
   | TXT | `brevo2._domainkey` | clave DKIM (par rotatorio) |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |

   Ojo: las guías viejas dicen `mail._domainkey`, que era de cuando Brevo se
   llamaba Sendinblue. Ahora son `brevo1` y `brevo2`.

   Ninguno pisa lo que ya hay: el MX y el SPF de la raíz se quedan como
   están, y el `brevo-code` es un TXT más en la raíz (varios TXT sí pueden
   convivir; lo que no puede haber es dos **SPF**).

3. La API key (empieza por `xkeysib-`) y el remitente, como secretos:

   ```bash
   supabase secrets set BREVO_API_KEY=xkeysib-xxxxxxxx
   supabase secrets set BREVO_FROM=facturas@psicologaenlanzarote.com
   supabase secrets set BREVO_FROM_NOMBRE="Psicóloga en Lanzarote"
   ```

   `facturas@` no necesita buzón: es sólo de salida. Cuando el paciente
   responde no va ahí, va al correo de ella (`replyTo` = `psicologas.email`).

4. Desplegar la función:

   ```bash
   supabase functions deploy enviar-factura-email
   ```

Mientras falten `BREVO_API_KEY` o `BREVO_FROM`, el botón responde con un
aviso que lo dice —«todavía no está configurado»— en vez de fallar sin
explicación.

## Consentimiento informado y protección de datos

El papel que antes se firmaba en la consulta. Desde la ficha del paciente se
pulsa **Enviar consentimiento**; le llega un correo con un botón, lo lee, pone
su DNI, marca la casilla, firma con el dedo y queda registrado.

En la ficha se ve en cuál de los tres estados está:

| Estado | Qué se ve en la ficha |
|---|---|
| `NO_ENVIADO` | botón **Enviar consentimiento** |
| `PENDIENTE` | badge ámbar *Esperando respuesta* + cuándo se envió, y *Volver a enviarlo* en discreto |
| `FIRMADO` | badge verde *Firmado* con la fecha y **Ver la firma** |

En el listado de pacientes sale un badge pequeño (*Firmado* / *Sin firmar*)
sólo si el consentimiento ya se ha pedido alguna vez: con mil fichas
heredadas, marcar en gris las que están sin enviar sería llenar la pantalla
de ruido.

### Las tres piezas

```
supabase/functions/
├─ enviar-consentimiento/    con sesión: genera el token y manda el correo
├─ consentimiento-ver/       sin sesión: «¿de quién es este enlace?»
└─ consentimiento-firmar/    sin sesión: guarda la firma
```

La pantalla del paciente es `/consentimiento?token=…`
(`src/pages/ConsentimientoPage.jsx`), **la única ruta de la app fuera de
`RutaProtegida`**. El texto legal vive entero en `src/lib/consentimiento.js`.

### El token es la llave

Las dos funciones públicas no tienen sesión de Supabase que mirar —el paciente
no tiene cuenta ni la va a tener—, así que **lo que autoriza es el token**: 32
bytes aleatorios que sólo están en su buzón. De ahí tres reglas que no
conviene tocar:

- Las consultas se hacen **siempre por `consentimiento_token`**, nunca por un
  id que venga del navegador. Es lo único que impide que ese endpoint sea una
  ventana abierta a la lista de pacientes.
- **El token se borra al firmar**, y se hace en la MISMA sentencia que graba la
  firma (`update … where token = … and estado = 'PENDIENTE'`). Comprobar antes
  y escribir después dejaría un hueco por el que se cuela una segunda firma
  desde otra pestaña.
- **Caduca a los 30 días** (`DIAS_VALIDEZ`). Reenviar crea uno nuevo, y el
  anterior deja de valer en ese momento: por eso el botón de reenviar es el
  menos visible de la ficha.

La letra del DNI **se comprueba también en el servidor**, y es la única cosa
del proyecto que está escrita dos veces (`src/lib/nif.js` y dentro de
`consentimiento-firmar`). No es descuido: ese DNI no se queda en el documento
firmado, pasa a `pacientes.dni` si la ficha no tenía ninguno, y de ahí a las
facturas. Un dedazo lo acaba pagando Hacienda un minuto después, con el número
de factura ya gastado — que es exactamente el error 1239 que dio origen a
`lib/nif.js`.

Lo que da valor a la firma no es el dibujo, es lo que se guarda con él: fecha,
IP, DNI declarado y **versión del texto aceptado**
(`VERSION_CONSENTIMIENTO`). Al cambiar el clausulado hay que subir esa versión
en `src/lib/consentimiento.js` **y** en
`supabase/functions/_shared/consentimiento.ts` — lo ya firmado conserva la
suya, que es justo el sentido de guardarla.

El nombre y el DNI que escribe el paciente se guardan en
`consentimiento_nombre` y `consentimiento_dni`, **sin pisar** `pacientes.nombre`.
Si la página pública pudiera escribir en el nombre de la ficha, cualquiera con
el enlace podría renombrar a un paciente en la agenda. El DNI sí se copia a la
ficha, pero sólo cuando estaba vacío.

### Para ponerlo en marcha

```bash
supabase secrets set APP_URL=https://dominio-de-produccion
supabase functions deploy enviar-consentimiento
supabase functions deploy consentimiento-ver
supabase functions deploy consentimiento-firmar
```

Las tres se despliegan **con la verificación de JWT puesta**, al contrario que
`webhook-whatsapp`. No hace falta quitarla: a las dos públicas las llama el
navegador del paciente con la clave `anon`, que ya es un JWT válido. Quien
decide si ese paciente puede ver o firmar algo es el token, no la clave.

Usa los mismos secretos de Brevo que la factura por correo (`BREVO_API_KEY`,
`BREVO_FROM`, `BREVO_FROM_NOMBRE`) y añade **`APP_URL`**, que es a dónde apunta
el enlace del correo. Si falta, se usa el primer valor de `APP_ORIGENES`; si no
hay ninguna de las dos, el botón avisa en vez de mandar un correo con un enlace
roto. El «responder a» sigue siendo `psicologas.email`.

La **migración 0018 ya está aplicada** (24/08/2026). Lo que sí hay que
asegurar al publicar `dist/` es que el hosting resuelva cualquier ruta contra
`index.html`: el enlace del correo entra directo en `/consentimiento`, sin
pasar por la portada. Para eso están `public/_redirects` (Netlify) y
`vercel.json` (Vercel).

> **El clausulado es un punto de partida**, escrito siguiendo el RGPD, la
> LOPDGDD y la Ley 41/2002. Antes de usarlo con pacientes reales conviene que
> lo revise quien lleve la protección de datos de la consulta: los plazos de
> conservación y los encargados del tratamiento dependen de con quién se haya
> firmado contrato.

## Importar y exportar pacientes

En _Pacientes_, al lado de «Nuevo paciente», hay un botón **Importar /
Exportar**. Resuelve los dos días raros de la vida de una consulta: el primero,
cuando la lista está todavía en el programa anterior o en un Excel, y el día en
que quiera llevársela a otro sitio. Los datos son suyos.

**Entran dos formatos: el Excel de verdad (`.xlsx`) y el CSV.** Se distinguen
por los primeros bytes del archivo, no por la extensión, porque renombrar un
CSV a `.xlsx` es un clásico y el error que saldría entonces no lo entendería
nadie.

- `src/lib/csv.js` se ocupa de las cuatro trampas de siempre — el separador (un
  Excel español exporta con `;`), las comillas, los saltos de línea dentro de un
  campo y el BOM sin el cual Excel enseña «LucÃ­a» — y reintenta en
  `windows-1252` si el archivo viene de un programa antiguo de Windows.
- `src/lib/xlsx.js` **lee el `.xlsx` sin ninguna librería.** Un Excel moderno es
  un ZIP con XML dentro, y descomprimir —lo único que parecía necesitar una
  dependencia— ya lo trae el navegador: `DecompressionStream('deflate-raw')`
  (Safari desde iOS 16.4). Lee la primera hoja **visible**, deshace las
  entidades XML y convierte las fechas, que en Excel son un número y sólo se
  saben fecha mirando el ESTILO de la celda (`xl/styles.xml`). Se prefirió esto
  a SheetJS porque la versión que queda en npm está abandonada y con
  vulnerabilidades conocidas —la buena sólo se distribuye desde su CDN— y porque
  pesa más de 400 KB, más que toda la aplicación junta.

El `.xls` viejo (Excel 97, formato binario) **no** se lee: la pantalla dice cómo
guardarlo como `.xlsx` o CSV. Los mensajes de error de estos dos módulos van
marcados con `amable: true` cuando están escritos para leerse en pantalla; el
resto se queda en la consola y arriba sale una frase genérica.

**Nada se guarda al elegir el archivo.** Primero se enseña qué se ha entendido:
de qué hoja se ha leído, cuántos son nuevos, cuántos ya están, qué columna es
cada cosa y qué líneas convendría revisar. Sólo entonces aparece el botón de confirmar. Meter 300
fichas equivocadas se deshace de una en una.

- **Los nombres de columna se adivinan.** Cada programa llama a lo mismo de una
  manera («Telf.», «Móvil», «Phone», «Apellido 1»), así que hay una lista de
  alias por campo en `src/lib/pacientesCsv.js`. Cuando la adivinanza falla, la
  ventana deja corregir la correspondencia a mano.
- **Se traduce lo que venga:** `15/03/1984`, `1984-03-15`, el `03/15/1984`
  americano y el `30756` con el que Excel guarda las fechas por dentro;
  `+34 600 11 22 33` → `600112233`; `60,00 €` → `60`. Lo que no se entiende se
  deja vacío y se avisa, en vez de inventarlo.
- **Un DNI con la letra cambiada se importa igual, pero avisando** (con la
  letra correcta, que `lib/nif.js` sabe calcular). Es un dato de ella, no de la
  aplicación; pero con la letra mal Hacienda rechazaría la factura.
- **Duplicados:** es el mismo paciente si coincide el DNI; si no hay DNI, el
  teléfono; y si tampoco, el nombre. Vale también entre líneas del propio
  archivo, que suelen venir con repetidos. A los que ya existen sólo se les
  **rellenan los huecos** (un correo que faltaba): lo que ya está escrito en la
  aplicación NO se pisa nunca.
- **La importación puede fallar a medias** —300 fichas y el wifi de una
  consulta— así que `crearPacientesEnLote` va de cien en cien y devuelve
  siempre lo que sí entró junto al error. La pantalla dice «se han guardado 180
  de 300» y basta con volver a importar el mismo archivo: los 180 ya se
  reconocen como repetidos.

Al exportar sale un CSV (que Excel abre de un doble clic) con las mismas
cabeceras que se reconocen al importar, así que **el archivo que sale vuelve a
entrar sin tocar nada**. Lleva sólo las
fichas (no las citas, ni las facturas, ni los consentimientos firmados) y son
datos de salud identificables: la propia ventana lo recuerda.

## Capa de servicios

Los componentes **nunca** llaman a Supabase: llaman a `src/services/*`. Cada
función devuelve siempre la misma forma:

```js
const { data, error } = await getPacientes()
// error === null            → todo bien
// error === { mensaje, tecnico } → `mensaje` se pinta en pantalla,
//                                  `tecnico` va a la consola
```

Ninguna lanza excepciones, así que la pantalla nunca se rompe: muestra el aviso
y ofrece _Reintentar_ (`AvisoError`). Mientras carga se pintan esqueletos con la
forma de las tarjetas (`Cargando` / `EsqueletoLista`), para que no “salte” el
contenido.

La base de datos habla en `snake_case` y la interfaz en `camelCase`; la
traducción vive dentro de cada servicio (`deFila` / `aFila`) y no sale de ahí.

Los pacientes **no se borran**: se archivan (`activo = false`), para no perder
su histórico de citas y facturas.

## Decisiones que conviene recordar

- **Citas de pareja:** guardan a las dos personas (`paciente_id` +
  `acompanante_id`, ambas con ficha propia). En la agenda se ven los dos
  nombres. Si se borra al acompañante la cita no desaparece (`ON DELETE SET
  NULL`).
- **Facturas: una por sesión**, no una mensual agrupada. La base ya lo impone
  con el índice único `idx_facturas_cita_unica` (una cita sólo se factura una
  vez).
- **Facturación automática:** ya no hace falta pulsar nada, ni en Pacientes ni
  en Facturación. El cron `psicofactur-facturar-citas-pasadas` (cada 15
  minutos, migración 0015) llama a `facturar_citas_pasadas()`, que crea la
  fila en `facturas` (borrador, sin emitir a Verifacti) para toda cita ya
  celebrada (`fecha_hora` pasada) y no cancelada que todavía no la tenga, con
  `importe = precio_sesion`. En las sesiones de pareja se factura al
  paciente titular. Al abrir Facturación se hace además una pasada desde el
  cliente (`facturarSesionesPendientes`, que reúne `getSesionesSinFacturar` +
  `facturarSesion`) por si el cron aún no ha llegado a una sesión recién
  terminada; ya no hay botón «Generar factura» ni modal «Sesiones sin
  facturar».
- **Método de pago editable:** `MetodoPagoBoton`, un botón-icono en cada fila
  que se pulsa para ir pasando por sin especificar (cartera) → efectivo
  (billete) → tarjeta → …, igual que el badge de estado de pago. Llama a
  `cambiarMetodoPago`. Es un dato de contabilidad y **no viaja a la AEAT** (el
  registro de facturación no recoge la forma de pago), así que se puede
  cambiar cuando sea. Los valores heredados (transferencia, bizum, otro) se
  ven con su icono y el ciclo los deja en «sin especificar» al primer toque.
- **Editar el borrador antes de emitir:** botón con lápiz en cada factura que
  todavía no ha salido a Hacienda (`!emitida && !anulada`). Abre
  `EditarFacturaModal` y sólo deja tocar el **importe** —la fecha de emisión
  no, porque la Edge Function la pone al día de hoy al emitir—. El servicio
  `editarBorradorFactura` cierra con `.is('verifactu_id', null)` +
  `.is('emitida_at', null)`: si la factura ya se hubiera emitido (por
  cualquiera de los dos caminos), no toca nada y avisa de que lo que queda es
  rectificar. Una factura emitida no se edita nunca.
- **La lista se agrupa y filtra por el mes de la SESIÓN**, no por el de
  emisión (`factura.mesSesion`, que sale de `cita.fecha_hora`; si la cita ya
  no está, cae al mes de `fecha_emision`). El desplegable de meses ofrece sólo
  los que tienen alguna factura, y el resumen de arriba se mueve con él.
- **Las facturas no se borran**: se anulan (`estado_pago = 'cancelado'`) y
  dejan de sumar en los totales. La tabla no tiene política de DELETE, y así
  la numeración correlativa nunca pierde un número.
- **Número de factura:** lo pone la base de datos, no el frontend. El trigger
  `asignar_numero_factura()` lee un contador por psicóloga y año
  (`contadores_factura`) y genera `2026/0001`, `2026/0002`… Se descartó
  `CREATE SEQUENCE` porque es global (mezclaría psicólogas) y no se reinicia
  cada 1 de enero. El índice único `facturas_numero_unico` es la red de
  seguridad.
- **Veri\*Factu: encendido o apagado** (`psicologas.verifactu_activo`, migración
  0028). **Apagado** (lo normal ahora): «Emitir» no llama a ninguna Edge
  Function ni a la AEAT — `emitirFacturaLocal` le pone la fecha de hoy y
  `facturas.emitida_at`, y ya está definitiva. El PDF sale **sin QR ni leyenda
  VERI\*FACTU** (una factura ordinaria completa del RD 1619/2012 no los
  necesita); descargar y enviar por correo aparecen en cuanto está emitida.
  Rectificar va por `rectificarFacturaLocal` (serie `R`, misma lógica que la
  Edge Function pero sin red). **Encendido**: todo el flujo de Verifacti de
  siempre (`generar-factura`, estados `Pendiente`/`Correcto`/`Incorrecto`,
  `sincronizar-estado-facturas`, Subsanar). El código de Verifacti no se ha
  tocado; sólo deja de ejecutarse. Reengancharlo = poner el flag a `true`, los
  secretos `VERIFACTI_*` y la API key de producción. La pantalla lee el flag de
  `getDatosFiscales` (`verifactuActivo`).
- **La factura por correo al paciente:** botón en cada factura de la lista,
  que le manda el PDF al correo de su ficha (`enviar-factura-email` + Brevo).
  Aparece **cuando la factura está cerrada**: con Veri\*Factu activo eso es
  `verifactu_estado = 'Correcto'` (el QR de una factura sin aceptar apunta a un
  registro que no existe); con Veri\*Factu apagado, en cuanto tiene
  `emitida_at`. Misma condición que «Descargar». La Edge Function lo vuelve a
  comprobar de su lado (`emitida_at` o `Correcto`): el botón se puede saltar,
  eso no.
  **La dirección de destino no viaja desde el navegador**: la lee la Edge
  Function de la ficha del paciente. Si se aceptara del cliente, el botón
  sería un formulario para mandar cualquier adjunto a cualquier dirección
  desde el dominio de la consulta.
  El PDF sí viaja desde el navegador, en base64, porque es exactamente el
  mismo que sale al descargarlo —lo dibuja `pdfFactura.js`—; rehacerlo en
  Deno sería mantener dos veces el mismo documento legal.
  Queda apuntado en `facturas.email_enviado_at` y `email_destinatario`
  (migración 0017). La dirección se guarda aparte de `pacientes.correo`
  porque si el paciente cambia de email, el registro tiene que seguir
  diciendo adónde fue de verdad.
- **El PDF va comprimido** (`compress: true` en jsPDF). No es cosmética: sin
  eso, jsPDF incrusta el PNG del QR como píxeles crudos y una factura de una
  página pesa **775 KB**; con la compresión, **7 KB**, sin tocar un píxel
  (es Flate, sin pérdida) y con el QR idéntico. Importa desde que la factura
  se manda por correo, porque ese PDF sube al servidor en base64 —un tercio
  más— cada vez que se pulsa Enviar, muchas veces desde el móvil.
- **Lista de espera:** quién quiere hueco en una semana que ya está llena
  (`lista_espera`, migración 0016). Se apunta con una **ventana de días**
  («esta semana», «la que viene») y una franja (mañana / tarde / cualquiera);
  el cruce entre lo que pidió y el hueco que se ha liberado vive en
  `lib/espera.js`, sin tocar la base.
  **Un hueco liberado NO es una tabla:** es una cita futura con
  `estado_confirmacion = 'cancelada'` que no tiene otra cita encima.
  Guardarlo aparte sería una copia que se queda vieja en cuanto ella mueva
  esa cita. Al dar el hueco a alguien se crea su cita y la espera pasa a
  `resuelto` con el `cita_id`; **la cita cancelada NO se borra**, porque al
  borrarla se llevaría por delante (ON DELETE CASCADE) el registro de
  WhatsApp que prueba que ese paciente canceló.
  La sección no está en la barra de navegación: se entra desde el
  Calendario, igual que «Eventos por revisar», para no robarle sitio a las
  cuatro de trabajo diario.
- **Consentimiento informado:** lo firma el paciente desde su móvil, en la
  única pantalla pública de la app (`/consentimiento?token=…`, migración
  0018). Ahí no hay sesión que valga: **quien autoriza es el token**, así que
  las funciones públicas consultan siempre por `consentimiento_token` y nunca
  por un id del navegador, el token se borra en la misma sentencia que graba
  la firma —para que dos pestañas no puedan firmar dos veces— y caduca a los
  30 días. Lo que la hace válida no es el trazo, sino la fecha, la IP, el DNI
  declarado y la **versión del texto** que se guardan con él. El nombre que
  escribe el paciente NO pisa `pacientes.nombre`: si lo hiciera, cualquiera
  con el enlace podría renombrar a un paciente en la agenda.
- **Realtime:** `citas` está en la publicación `supabase_realtime` y
  `suscribirCitas()` refresca la agenda y el panel de recordatorios solos.
  Mañana será el webhook de WhatsApp quien dispare esos cambios.
- **Recordatorios:** el frontend **sólo lee** `citas.estado_confirmacion`.
  Quien lo escribe es el trigger `sync_estado_confirmacion`, cuando algo
  cambia `recordatorios_whatsapp.boton_pulsado` (`confirmo` → confirmada,
  `no_puedo` → cancelada). En `recordatorios_whatsapp` la app sólo hace
  INSERT (queda el histórico de envíos); el UPDATE lo hará el webhook con
  la clave de servicio, y de hecho el RLS no tiene política de UPDATE.
  «Sin enviar» no es un estado de la base: es una cita sin ningún
  recordatorio todavía.

## Detalles pensados para el uso diario

- Navegación lateral en escritorio y barra inferior en móvil, con las mismas
  4 secciones y zonas de toque grandes.
- Tipos de cita siempre con el mismo color: Individual (verde), Pareja (malva),
  Online (azul).
- El estado de pago es un botón: un toque marca la factura como cobrada.
- En Recordatorios, el punto naranja **late** mientras se espera respuesta del
  paciente: recuerda que ese dato se actualiza solo. El botón _«Ver cómo
  funciona»_ activa un modo demostración para simular la respuesta.
