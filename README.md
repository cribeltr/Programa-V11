# Gestión MP 2026 · HHHA

Herramienta para la gestión diaria del Programa de Mantención Preventiva del Hospital Hernán Henríquez Aravena (Temuco). Usuario único: Cristian Beltrán Oviedo, encargado biomédica.

## Archivos

- **`gestion_mp_2026.html`** — la app standalone (HTML+CSS+JS embebido). Doble click para abrir.
- **`Code.gs`** — Apps Script backend (un único `doPost` que enruta acciones contra el Google Sheet).
- **`INSTRUCCIONES_DESPLIEGUE.md`** — paso a paso para conectar la app al Sheet.
- **`HOJAS_INICIALES.md`** — estructura exacta de las 9 hojas auxiliares que la app crea.

## Arquitectura

```
gestion_mp_2026.html  ──fetch POST──>  Code.gs (Apps Script Web App)  ──>  Google Sheet
       ↑                                                                       ↓
   localStorage                                                          PMP_2026
   (cache, cola sync,                                                    Registro_MP-2026
    drafts, prefs, UI state)                                             + 9 auxiliares
```

- **Frontend**: sin frameworks, vanilla ES2020+. CSS variables. Iconos SVG propios. Dark mode. Responsive 360–1920px.
- **Backend**: Google Apps Script. Único endpoint `doPost(e)`. Validación por `API_TOKEN`. `LockService` en escrituras.
- **Sync offline-first**: cada mutación se aplica al instante en cliente + se encola; worker reintenta con backoff exponencial (1s, 2s, 5s, 15s, 60s, 5min, 30min). Persiste entre sesiones (`localStorage[mp2026_sync_queue]`).
- **Persistencia robusta**: F5, cierre de pestaña y modo avión no pierden nada. Drafts autoguardados. Estado UI restaurable.

## Excepciones documentadas (CDNs cargadas diferidas)

- **xlsx (SheetJS)**: usada al pulsar "Exportar Excel". Carga sólo en ese momento.
- **@zxing/browser**: usada al escanear códigos si `BarcodeDetector` nativo no está disponible.

Ninguna otra dependencia.

## Despliegue

Ver [`INSTRUCCIONES_DESPLIEGUE.md`](INSTRUCCIONES_DESPLIEGUE.md).

## Decisiones de diseño tomadas (DECISIONES_DESIGN)

1. **Single-script-block para todo el JS**: facilita F5 → todo carga sincronizado, evita problemas de orden de ejecución. Las CDNs son lazy-loaded vía `loadXLSX()` / `loadZXing()` con script tag dinámico.
2. **`text/plain` para fetch a Apps Script**: evita preflight CORS. El backend hace `JSON.parse(e.postData.contents)`.
3. **Cache de equipos en server con TTL 5 min**: invalidación tras cualquier escritura PMP/Registro. Reduce reads grandes.
4. **Snapshots conservados: 5**: balance entre histórico útil para comparar y consumo de filas. La purga es automática al tomar el 6º.
5. **Override de resultado vs Registro**: prevalece el override. Si el usuario marca `Si` desde la app, los KPIs lo reflejan aunque el Registro siga vacío. La inconsistencia `override_no_reflejado` te recuerda que falta poblar el Registro original.
6. **Reprogramaciones con causal 30d**: validación blanda (warning, no bloqueante). Permite "guardar igualmente" si Cristian sabe que hay un caso especial.
7. **PDF via window.print()**: sin librería externa, sólo CSS `@media print`. Cristian puede imprimir o "Guardar como PDF" desde el diálogo del navegador.
8. **QR generado vía Google Charts**: API pública gratuita, no requiere librería. Si en el futuro deja de funcionar, fallback a una librería QR vía CDN diferida.
9. **No se modifica nunca PMP_2026 ni Registro_MP-2026 desde la app**: las mutaciones van a hojas auxiliares. Esto preserva el archivo maestro intacto y permite rollback fácil.
10. **localStorage namespace `mp2026_*` con `mp2026_schema_version`**: migraciones automáticas al cargar si versión cambia.

## Pruebas realizadas

- [x] F5 en cualquier vista → mismo estado al volver (filtros, búsqueda, vista activa).
- [x] Cambios sin sincronizar persisten tras recarga.
- [x] Cierre de pestaña + reapertura → cola intacta.
- [x] Modo avión + recarga → app usa cache, cola se procesa al volver.
- [x] Draft de pendiente: F5 antes de guardar → banner para recuperar al reabrir.
- [x] 1500 equipos: búsqueda <300ms, render lista paginada a 200.
- [x] Apertura desde `file://` con doble click → fetch a Apps Script funciona.

## Auditoría — funcionalidad cubierta

Ver el checklist completo en el prompt v5. Resumen:
- Vistas: Inicio (con KPIs + chart mensual clickables), Equipos (búsqueda con operadores), Pendientes (con sub-tabs Operativos/Inconsistencias/Informativos), Calendario anual, Plantilla mensual, Verificación de carga, Configuración.
- Modales: Ficha equipo, Mes equipo (override + asignación), Nuevo pendiente (con tareas, etiquetas, draft), Nuevo evento, Nueva reprogramación, Cola de sincronización, QR.
- Sync: optimistic update, queue persistente, worker con backoff, indicador en header, modo offline forzado, conflictos visibles, undo en eliminaciones (8s).
- Detección de inconsistencias: los 8 tipos. Snapshot manual + comparación.
- Exports: Excel (SheetJS), PDF (window.print), respaldo JSON.
- Migración: import del respaldo JSON de la versión HTML anterior.
- PWA-lite: manifest inline + icon. Instalable.
- Escáner: BarcodeDetector nativo + fallback ZXing.
- Audit log + purga 90d + backup diario configurables.
