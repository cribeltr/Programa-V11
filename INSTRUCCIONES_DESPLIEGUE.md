# INSTRUCCIONES_DESPLIEGUE — paso a paso para Cristian

Tienes dos archivos en este paquete:
- `gestion_mp_2026.html` — la app, todo en uno.
- `Code.gs` — el backend de Apps Script, archivo único.

Tiempo estimado: 10 minutos.

## 1. Crea un Google Sheet vacío

Abre [sheets.google.com](https://sheets.google.com) → "Hoja en blanco". Asígnale un nombre, ej. `MP_2026_HHHA`. **No subas el .xlsm a Drive**: lo cargarás directamente desde la app más tarde (paso 8).

## 2. Copia el SPREADSHEET_ID

Con el Sheet abierto, la URL es algo como:
```
https://docs.google.com/spreadsheets/d/1AbC_xyz...XYZ/edit#gid=0
```
El `SPREADSHEET_ID` es la parte entre `/d/` y `/edit`. Cópiala.

## 3. Abre `gestion_mp_2026.html` y entra al wizard

Doble click sobre `gestion_mp_2026.html`. Se abre en tu navegador. La primera vez aparece un wizard de 3 pasos:

- **Paso 1**: pega el `SPREADSHEET_ID` que copiaste.
- **Paso 2**: pulsa "Generar token". Copia el valor (algo como `kJ7Hgf3PxQ...`).

## 4. Crea el Apps Script

1. Ve a [script.google.com](https://script.google.com).
2. Pulsa "Nuevo proyecto" (esquina superior izquierda).
3. Asígnale un nombre, ej. "MP 2026 API".
4. En el editor verás un archivo `Código.gs` (o `Code.gs`) con `function myFunction() {}`. Borra todo.
5. Abre `Code.gs` (el archivo que viene junto al HTML) en un editor de texto. Selecciona todo, copia, y pega en el editor de Apps Script.
6. En la línea 21 verás:
   ```js
   const TOKEN = 'PEGA_TU_TOKEN_AQUI';
   ```
   Reemplaza `PEGA_TU_TOKEN_AQUI` por el token que generaste en el paso 3. **Debe ser exactamente el mismo valor** — un solo carácter de diferencia y la app no podrá conectar.
7. Guarda con `Ctrl+S` (icono disquete).

## 5. Despliega como Web App

En el Apps Script:

1. Pulsa "Implementar" (botón azul, esquina superior derecha) → "Nueva implementación".
2. En el icono de engranaje al lado de "Seleccionar tipo", elige "Aplicación web".
3. Completa:
   - Descripción: `MP 2026 v1` (libre).
   - Ejecutar como: **Yo (tu_email@…)**.
   - Quién tiene acceso: **Cualquier persona**.
4. Pulsa "Implementar".
5. Google te pedirá autorizar la app. Acepta los permisos solicitados (Sheets, Drive, Mail).
6. Al finalizar verás una URL que termina en `/exec`. Cópiala.

## 6. Vuelve al HTML y completa el wizard

- **Paso 3**: pega la URL en `WEB_APP_URL`.
- Pulsa "Probar conexión y entrar".

Si todo está bien aparece el toast verde "Conectado ✓" y la app inicializa las 9 hojas auxiliares en tu Sheet. **Las hojas auxiliares se crean ocultas** para que sólo veas `PMP_2026` y `Registro_MP-2026` cuando abras el Sheet.

## 7. Sube el maestro Excel desde la app

Configuración → **Cargar maestro (Excel)** → "Elegir archivo y cargar" → selecciona tu `ProgramaciónMP_2026.xlsm` (o .xlsx).

La app lee el archivo en tu navegador (no se sube a Drive), te muestra un preview con el conteo de filas y las primeras filas de `PMP_2026`, y cuando confirmas envía todo al Google Sheet. En 15–60 segundos las hojas `PMP_2026` y `Registro_MP-2026` quedan pobladas.

> **Reemplaza el contenido completo** de esas dos hojas. Las hojas auxiliares (eventos, pendientes, asignaciones) **no se tocan**.

## 8. (Opcional) Activa los triggers automáticos

En el editor de Apps Script:
1. Selecciona la función `setupTriggers` en el dropdown superior.
2. Pulsa "Ejecutar".
3. Acepta los permisos.

Esto programa:
- Purga del `AuditLog` (entradas >90 días) diariamente a las 3:00.
- Backup del Sheet en carpeta `Respaldos_MP_2026` diariamente a las 2:00 (conserva 30 copias).
- Email de aviso al inicio de cada mes (sólo si `NOTIFICAR_INICIO_MES=true` y `EMAIL_NOTIFICACIONES` está poblado en la hoja `Config`).

## 9. Uso diario

- La app guarda la config en `localStorage`. No vuelve a pedirla.
- Si recargas la pantalla (F5), vuelve exactamente al estado donde la dejaste.
- Todas las acciones funcionan **offline**: se aplican localmente al instante y se sincronizan en segundo plano. El indicador del header te muestra cuántos cambios hay en cola.
- Si pierdes conexión, sigue trabajando: los cambios se acumulan en cola.

## 10. Instalar en el celular (PWA-lite)

1. Abre la app en el celular (puedes escanear el QR desde Configuración → Generar QR).
2. **iOS Safari**: botón compartir → "Agregar a pantalla de inicio".
3. **Android Chrome**: menú → "Agregar a pantalla de inicio".

Se instala con icono propio. Útil para escanear códigos de barras en terreno con la cámara del teléfono.

## 11. (Opcional) Importar respaldo de la versión HTML anterior

Si ya tienes un respaldo JSON exportado desde la versión HTML anterior:

1. En la app, ve a Configuración → Datos → "Importar respaldo JSON".
2. Selecciona el archivo `.json`.
3. La app envía los eventos, pendientes, reprogramaciones, overrides y asignaciones al Sheet (no toca PMP/Registro).

## Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| `unauthorized` al probar conexión | Token no coincide | Verifica que el `TOKEN` del Apps Script sea idéntico al de la app |
| `http_404` | URL incorrecta | Reabre la implementación y copia la URL correcta (termina en `/exec`) |
| `sheet_not_found:PMP_2026` | Hoja renombrada o falta | Renombra la hoja a exactamente `PMP_2026` |
| Cambios no se sincronizan | Cola con errores | Configuración → Sincronización → "Reintentar ahora" o "Ver detalle" |
| App lenta al cargar | Cache vacía | Espera al primer fetch (1-3s). Las siguientes recargas son instantáneas |

## Notas

- El Apps Script tiene un límite diario de ~90 min de ejecución y 6 min por ejecución. La app usa cache agresivo y batches para minimizar consumo.
- Para multiusuario en el futuro, migrar a OAuth (el `API_TOKEN` actual es suficiente para uso de un único técnico).
- Si quieres ver el código que debes pegar en Apps Script desde la propia app: Configuración → "Ver código Code.gs".
