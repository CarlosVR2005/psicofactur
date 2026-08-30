# Graph Report - psicofactur  (2026-08-30)

## Corpus Check
- 160 files · ~106,802 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 816 nodes · 2312 edges · 62 communities (40 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.5)
- Token cost: 145,318 input · 25,645 output

## Community Hubs (Navigation)
- UI Component Library
- Agenda & Calendar Views
- Settings Page & Data Hooks
- CSV Import / Export
- Fiscal Data & Consent Text
- Domain Concepts & Integrations
- Badges & Invoice Action Buttons
- Automatic Reminder Edge Function
- Build Dependencies (package.json)
- Appointment Modal & Reminder Hooks
- Verifactu Invoice Generation
- App Shell & Routing
- Consent Signing Edge Functions
- Edge Function CORS & Auth Helpers
- Email Sending Edge Functions
- Google OAuth Edge Functions
- Google Agenda Sync (import)
- Google Calendar Credentials Schema
- Brand Identity & PWA Icons
- Multi-signer Consent Schema
- Waiting List Schema
- Google Agenda Import Schema
- Invoice Counter Fix Migration
- Individuals & Companies Billing Schema
- Automatic Psychologist Auth Migration
- Companion & Invoice Numbering Migration
- Automatic Past-Appointment Billing
- Google Polling Cron Migration
- WhatsApp Reminder Cron Migration
- Delete Patient Migration
- Vercel Config
- contadores_factura Table
- citas Table (ref A)
- citas Table (ref B)
- recordatorios_whatsapp Table (ref A)
- recordatorios_whatsapp Table (ref B)
- facturas Table (ref A)
- facturas Table (ref B)
- psicologas Table (ref A)
- facturas Table (ref C)
- pacientes Table (ref A)
- psicologas Table (ref B)
- pacientes Table (ref B)
- facturas Table (ref D)
- pacientes Table (ref C)
- psicologas Table (ref C)

## God Nodes (most connected - your core abstractions)
1. `exito()` - 61 edges
2. `ejecutar()` - 53 edges
3. `fallo()` - 38 edges
4. `aClave()` - 35 edges
5. `Boton()` - 26 edges
6. `hoy()` - 25 edges
7. `psicologaActualId()` - 22 edges
8. `AvisoError()` - 21 edges
9. `etiquetaDia()` - 18 edges
10. `PacienteDetallePage()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Carlos Vizcaino Rigol (operator / data processor)` --governs--> `Psicofactur`  [EXTRACTED]
  public/privacidad.html → README.md
- `Psicofactur` --depends_on--> `Vercel`  [EXTRACTED]
  README.md → public/privacidad.html
- `Verifacti / Veri*Factu` --depends_on--> `Supabase Edge Functions (Deno)`  [INFERRED]
  public/condiciones.html → README.md
- `Special-category health data` --part_of--> `Pacientes (patients)`  [INFERRED]
  public/privacidad.html → README.md
- `Google Calendar integration` --governs--> `Google API Limited Use policy`  [EXTRACTED]
  README.md → public/privacidad.html

## Import Cycles
- None detected.

## Communities (62 total, 22 thin omitted)

### Community 0 - "UI Component Library"
Cohesion: 0.06
Nodes (71): Cabecera(), Avatar(), COLORES, TAMANOS, Aviso(), AvisoError(), Boton(), TAMANOS (+63 more)

### Community 1 - "Agenda & Calendar Views"
Cohesion: 0.07
Nodes (73): CitaChip(), primerNombre(), horaCorta(), HuecoLibre(), huecosEntre(), ListaDelDia(), PUNTO_CONFIRMACION, VistaMes() (+65 more)

### Community 2 - "Settings Page & Data Hooks"
Cohesion: 0.08
Nodes (69): ConexionGoogle(), ConexionWhatsApp(), RecordatorioCard(), useFacturas(), usePaciente(), horarioVacio(), supabase, AjustesPage() (+61 more)

### Community 3 - "CSV Import / Export"
Cohesion: 0.07
Nodes (48): AMBITOS, ImportarExportarModal(), PESTANAS, QUE_HACER_CON_DUPLICADOS, TONOS, CANDIDATOS, contarFuera(), decodificarTexto() (+40 more)

### Community 4 - "Fiscal Data & Consent Text"
Cohesion: 0.10
Nodes (36): DatosFiscales(), ibanBonito(), ibanLimpio(), LienzoFirma(), conDestacados(), TextoLegal(), conColegiado(), conNif() (+28 more)

### Community 5 - "Domain Concepts & Integrations"
Cohesion: 0.08
Nodes (42): Agencia Española de Protección de Datos (AEPD), Automatic billing cron (facturar_citas_pasadas), Brevo (email delivery), Carlos Vizcaino Rigol (operator / data processor), Citas (appointments), Confirmafy colour circles, Consent token (consentimiento_token), Supabase Edge Functions (Deno) (+34 more)

### Community 6 - "Badges & Invoice Action Buttons"
Cohesion: 0.08
Nodes (32): Badge(), PUNTOS, TAMANOS, TONOS, CONFIRMACION_LEYENDA, LeyendaConfirmacion(), LeyendaTipos(), TipoCitaBadge() (+24 more)

### Community 7 - "Automatic Reminder Edge Function"
Cohesion: 0.10
Nodes (32): recordarUna(), Resumen, CitaParaRecordatorio, COLUMNAS_CITA, configDeLaConsulta(), ConfigWhatsApp, enviarRecordatorio(), huecosDeLaPlantilla() (+24 more)

### Community 8 - "Build Dependencies (package.json)"
Cohesion: 0.06
Nodes (34): lucide-react, dependencies, jspdf, lucide-react, qrcode, react, react-dom, react-router-dom (+26 more)

### Community 9 - "Appointment Modal & Reminder Hooks"
Cohesion: 0.13
Nodes (24): CitaModal(), EstadoConfirmacionBadge(), ESTADOS, SIN_ENVIAR, useCitas(), useCitasDePaciente(), useRecordatorios(), BOTON_WHATSAPP (+16 more)

### Community 10 - "Verifactu Invoice Generation"
Cohesion: 0.13
Nodes (26): CAMPOS_FISCALES, ConfigVerifactu, ETIQUETA_TIPO, camposRectificativa(), claveIdempotencia(), consultarEstadoFactura(), crearFactura(), crearFacturaRectificativa() (+18 more)

### Community 11 - "App Shell & Routing"
Cohesion: 0.21
Nodes (12): App(), AppLayout(), Marca(), SECCIONES, RutaProtegida(), Sidebar(), TabBar(), LoginPage() (+4 more)

### Community 12 - "Consent Signing Edge Functions"
Cohesion: 0.17
Nodes (15): DatosCorreo, DIAS_VALIDEZ, edad(), EDAD_CONSENTIMIENTO_SANITARIO, enlaceCaducado(), escapar(), esProgenitor(), firmanLosProgenitores() (+7 more)

### Community 13 - "Edge Function CORS & Auth Helpers"
Cohesion: 0.21
Nodes (11): noVale(), noVale(), ORIGENES, cabecerasCors, json(), respuestaPreflight(), googleConfigurado(), clienteDeUsuaria() (+3 more)

### Community 14 - "Email Sending Edge Functions"
Cohesion: 0.18
Nodes (12): Destino, ASUNTO_CONSENTIMIENTO, enlaceDeFirma(), nuevoToken(), urlDeLaApp(), Adjunto, CorreoSaliente, emailConfigurado() (+4 more)

### Community 15 - "Google OAuth Edge Functions"
Cohesion: 0.16
Nodes (11): accessTokenValido(), canjearCodigo(), emailDelIdToken(), ErrorGoogle, pedirToken(), refrescarToken(), RespuestaToken, revocar() (+3 more)

### Community 16 - "Google Agenda Sync (import)"
Cohesion: 0.27
Nodes (13): aplicarCambio(), BOLA_ESTADO, datosDelTitulo(), esApunteDeCaja(), esRuido(), estadoPorBola(), intentarImportar(), limpiarNombre() (+5 more)

### Community 17 - "Google Calendar Credentials Schema"
Cohesion: 0.19
Nodes (6): public.google_credenciales, public.google_guardar_credenciales(), public.google_leer_credenciales(), public.google_oauth_estados, public.psicologas, vault.decrypted_secrets

### Community 18 - "Brand Identity & PWA Icons"
Cohesion: 0.33
Nodes (7): Favicon / Apple Touch Icon, Brand Teal #4F7C74, Head + Leaf + Clipboard Iconography, Psicofactur App Icon (person glyph), Psicofactur Brand Identity, Psicofactur Full Logo, PWA Installable Icons

### Community 19 - "Multi-signer Consent Schema"
Cohesion: 0.33
Nodes (6): public.refrescar_consentimiento_resumen, consentimiento_firmantes_resumen, public.consentimiento_firmantes, public.refrescar_consentimiento_resumen(), public.pacientes, public.psicologas

### Community 20 - "Waiting List Schema"
Cohesion: 0.29
Nodes (6): public.set_updated_at, public.lista_espera, public.citas, public.pacientes, public.psicologas, trg_lista_espera_updated_at

### Community 21 - "Google Agenda Import Schema"
Cohesion: 0.40
Nodes (5): public.eventos_google_pendientes, public.paciente_por_nombre(), public.paciente_por_telefono(), public.pacientes, public.psicologas

### Community 22 - "Invoice Counter Fix Migration"
Cohesion: 0.33
Nodes (4): public.facturar_citas_pasadas(), public.citas, public.facturas, public.pacientes

### Community 26 - "Automatic Past-Appointment Billing"
Cohesion: 0.50
Nodes (3): public.facturar_citas_pasadas(), public.citas, public.pacientes

## Knowledge Gaps
- **125 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+120 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `aClave()` connect `Agenda & Calendar Views` to `UI Component Library`, `Appointment Modal & Reminder Hooks`, `Settings Page & Data Hooks`, `CSV Import / Export`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `exito()` connect `Settings Page & Data Hooks` to `Appointment Modal & Reminder Hooks`, `Agenda & Calendar Views`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `fallo()` connect `Settings Page & Data Hooks` to `UI Component Library`, `Agenda & Calendar Views`, `Fiscal Data & Consent Text`, `Badges & Invoice Action Buttons`, `Appointment Modal & Reminder Hooks`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _125 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Component Library` be split into smaller, more focused modules?**
  _Cohesion score 0.06235399820305481 - nodes in this community are weakly interconnected._
- **Should `Agenda & Calendar Views` be split into smaller, more focused modules?**
  _Cohesion score 0.06730506155950752 - nodes in this community are weakly interconnected._
- **Should `Settings Page & Data Hooks` be split into smaller, more focused modules?**
  _Cohesion score 0.08180574555403557 - nodes in this community are weakly interconnected._