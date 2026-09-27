# Validaciones por fase

Registro de las pruebas hechas al cerrar cada fase, antes de etiquetar la versión.

## v0.0.1: Phase 1 (setup y esqueleto)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm build` desde un `dist/` limpio | ✅ genera `extension.js`, `prefs.js`, `metadata.json` y `schemas/gschemas.compiled` |
| `pnpm test` | ✅ 1/1 |
| `pnpm typecheck` | ✅ los tipos de GNOME 48 son efectivos (un código erróneo a propósito produce errores de tipo) |
| `pnpm smoke` (Shell anidada) | ✅ `enabled` → ACTIVE (1), `disabled` → INACTIVE (2), sin errores de JS |
| Aislamiento de dconf | ✅ `enabled-extensions` de la sesión real no contiene `zsa-helper@ajmasia` |
| Commits firmados | ✅ firma SSH válida con `ajmasia.dev@ysnp.link` |

## v0.0.2: Phase 2 (lógica pura)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` | ✅ 42 tests en 5 ficheros (protocolo, layout, etiquetas, geometría, visibilidad) |
| `pnpm typecheck` | ✅ incluye los tests, compilados sin tipos de GNOME: `src/core/` no depende de GNOME |
| Mapeo Oryx → QMK | ✅ 260/260 teclas coinciden con el `keymap.c` compilado del layout real (test automático) |
| Etiquetas | ✅ las 260 teclas del layout real resuelven sin keycodes desconocidos |
| `pnpm smoke` | ✅ la extensión sigue activándose y desactivándose sin errores |

**Decisión revisada:** las teclas transparentes heredan de la capa base (ver el PRD).
**Pendiente para la fase 3:** validar con pulsaciones reales la traducción del evento (fila, columna)
a la tecla.

## v0.0.3: Phase 3 (conexión con el teclado)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` / `pnpm typecheck` | ✅ 50 tests; tipos `@girs` fijados a GNOME 48 |
| Descubrimiento | ✅ localiza `/dev/hidraw4` por VID y descriptor raw HID |
| Handshake | ✅ protocolo 5 y firmware `aOa9o/nlzDl9`, sin errores `0xFF` tras corregir las escrituras |
| Emparejamiento sin Keymapp | ✅ validado por el usuario: los eventos de capa llegan con Keymapp cerrado |
| Mapeo evento → tecla | ✅ validado por el usuario: Q, A, ESC, SPACE, Y y ENTER dan 7, 13, 0, 24, 32 y 51 |
| Reconexión USB | ✅ validado por el usuario: `searching` → `connected` sin reiniciar |
| Suspensión y reanudación | ✅ validado por el usuario |
| Convivencia con Keymapp | ✅ validado por el usuario |
| `pnpm smoke` | ✅ sin regresiones |

## v0.0.4: Phase 4 (obtención del layout)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `probe:layout --clear` | ✅ `source=oryx-api` (387 ms), 5 capas × 52 teclas (ejecutado por el usuario) |
| `probe:layout` | ✅ `source=cache` (2 ms) (ejecutado por el usuario) |
| `probe:layout --clear --offline` | ✅ `source=keymapp` (12 ms) (ejecutado por el usuario) |
| Revisión inexistente, con y sin red | ✅ `LayoutUnavailableError` con el motivo de cada fuente |
| IDs inválidos | ✅ rechazados antes de tocar disco, red o SQL |
| `pnpm test` / `typecheck` / `smoke` | ✅ 57 tests, sin regresiones |

## v0.0.5: Phase 5 (overlay, atajo, HUD y resaltado)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` / `typecheck` | ✅ 62 tests |
| Capturas en la Shell anidada (`pnpm nested --shots`) | ✅ las 5 capas y el resaltado se renderizan sin errores de JS |
| `pnpm smoke` | ✅ ACTIVE con 1 fd de hidraw → INACTIVE con 0 fds (sin restos al desactivar) |
| HUD al mantener una capa | ✅ validado por el usuario |
| Atajo `Super+Alt+K` sin robar el foco | ✅ validado por el usuario |
| Resaltado en la posición física | ✅ validado por el usuario |
| Reconexión con el overlay visible | ✅ validado por el usuario |
| Sin barra de título, fuera de Alt+Tab | ✅ actor de chrome de la Shell, no una ventana |

**Ajuste tras la revisión:** el overlay mantiene la capa consultada mientras se oculta, en lugar de
mostrar la base antes de desaparecer.

## v0.0.6: Phase 6 (preferencias)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| `pnpm test` / `typecheck` | ✅ 62 tests |
| `pnpm probe:prefs` | ✅ los cambios en los ajustes se reflejan en la interfaz (atajo, HUD, posición, tamaño) |
| `prefs.js` en la app Extensiones (Shell anidada) | ✅ carga sin errores |
| Captura y restauración del atajo | ✅ validado por el usuario |
| Controles → ajustes aplicados en caliente | ✅ validado por el usuario |
| Refrescar layout | ✅ validado por el usuario |

## v0.1.0: Phase 7 (MVP, validación final en la sesión real)

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario tras usarla en su sesión real (instalada desde el zip)

Instalación validada: `pnpm zip` → zip sin `dev/` → `gnome-extensions install` (compila el
esquema) → `pnpm smoke` contra esa instalación: ACTIVE, INACTIVE y 0 fds de hidraw. En la sesión
real el journal muestra la extensión ACTIVE, conectada y cargando el layout, sin errores.

| # | Criterio del PRD | Estado | Notas |
|---|---|---|---|
| 1 | La capa cambia en < 100 ms sin tirones | ✅ | Sin retrasos ni tirones percibidos en uso real. La cifra en ms (`ZSA_HELPER_DEBUG`) no se llegó a registrar |
| 2 | El atajo funciona desde cualquier app y no roba el foco | ✅ | Uso real |
| 3 | Sin barra de título; fuera de Alt+Tab, actividades y dock | ✅ | Uso real; el overlay es un actor de chrome |
| 4 | El HUD muestra la capa al mantener y la oculta tras el retardo | ✅ | Uso real y Shell anidada (fase 5) |
| 5 | El resaltado coincide con la posición física | ✅ | Mapeo 260/260 (test) y pulsaciones reales (fase 3) |
| 6 | Transparentes atenuadas y etiquetas propias intactas | ✅ | Tests de etiquetas y capturas |
| 7 | Recuperación tras desconectar o suspender | ✅ | Validado con `probe:device` en la fase 3; el código de reconexión es el mismo |
| 8 | Revisión nueva flasheada → se muestra sola; sin red, la caché | ⚠️ | Caché y respaldo validados (fase 4). **Pendiente:** comprobarlo con un flasheo real |
| 9 | Keymapp sigue funcionando a la vez | ✅ | Fase 3 y uso real con Keymapp abierto |
| 10 | Desactivar no deja restos | ✅ | `pnpm smoke`: INACTIVE y 0 fds de hidraw |
| 11 | Los tests de Vitest pasan | ✅ | 62 tests |

**Ajustes tras el uso real:** la sombra del panel se iguala a la de una ventana de libadwaita
(sin halo), las teclas pasan a ser planas y la Shell anidada carga siempre `dist/`, nunca la copia
instalada.

## v0.2.0: mejoras tras el MVP

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Mejora | Comprobación | Resultado |
|---|---|---|
| LED en las teclas de bloqueo (Caps Lock, Num Lock) | Tests de etiquetas (incluidas heredadas y con modificadores), captura con Caps activo, `smoke` | ✅ validado por el usuario en uso real |
| Arrastrar el overlay y restaurar la posición | Tests de posición relativa (ida y vuelta, cambio de resolución, límites), captura de preferencias, `smoke` con el arrastre activo | ✅ validado por el usuario en la Shell anidada |

Siguen pendientes de la v0.1.0: el criterio 8 (flasheo real).

## v0.2.1: corrección del fundido de salida

**Fecha:** 2026-09-25
**Resultado:** ✅ solicitada por el usuario

| Comprobación | Resultado |
|---|---|
| Fotograma a mitad del fundido (`pnpm nested --shots`, `fade-out.png`) | ✅ el fondo del panel y las teclas tienen la misma opacidad efectiva (0.30 y 0.30); antes el fondo desaparecía primero y las teclas quedaban encima |
| `pnpm test` / `typecheck` / `smoke` | ✅ 69 tests, sin restos al desactivar |

## v0.3.0: multimonitor y preferencias en pestañas

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| Tests de monitores (conector → índice, respaldo al principal, conector a guardar, lectura de `DisplayConfig`) | ✅ 77 tests |
| Dos monitores simulados en la Shell anidada | ✅ Primary → x=176 (monitor 1); `LVDS2` → x=1456 (monitor 2); `HDMI-9` desconectado → monitor principal; `LVDS2` + posición personalizada (1, 0) → 1632,0 |
| Preferencias en pestañas (General, Appearance, Layout) | ✅ capturas de cada pestaña, incluido un monitor desconectado |
| Elegir monitor, arrastrar entre pantallas, desconectar y restaurar con monitores reales | ✅ validado por el usuario |
| `smoke` | ✅ sin restos al desactivar |

## v0.4.0: pestaña Status y correcciones pequeñas

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| Tests de estado (descripción de cada caso, distribución de teclado, identificación de la Voyager, JSON publicado) | ✅ 90 tests |
| Estado publicado por D-Bus en la Shell anidada | ✅ `connected`, protocolo 5, firmware `aOa9o/nlzDl9`, layout desde la caché |
| Pestaña *Status* conectada a la Shell anidada | ✅ todas las filas correctas |
| Zip sin código de desarrollo | ✅ `extension.js` sin referencias a `dev/` y con sintaxis válida |
| `smoke` | ✅ el servicio D-Bus se retira al desactivar; 0 fds de hidraw |
| Permisos denegados y teclado no soportado | ⚠️ solo cubiertos por tests (no reproducibles sin quitar la regla udev u otro teclado ZSA) |

## v0.4.1: robustez del emisor de eventos y de la lista de monitores

**Fecha:** 2026-09-25
**Resultado:** ✅ aprobada por el usuario

| Comprobación | Resultado |
|---|---|
| Test de aislamiento de listeners | ✅ fallaba antes de la corrección y pasa después; 91 tests |
| Listener que lanza una excepción con el teclado real | ✅ el error se registra, el resto de eventos llega y la conexión se mantiene (`searching → connected`, sin reconexiones) |
| `DisplayConfig` forzado a fallar | ✅ 4 intentos (inicial y tres reintentos) y se detiene |
| Multimonitor (`LVDS2`, dos monitores simulados) | ✅ sin regresión (x=1456) |
| `smoke` | ✅ sin restos al desactivar |

## v0.5.0: Phase 8 (robustez)

**Fecha:** 2026-09-25
**Resultado:** ✅ publicada por decisión del usuario; el flasheo real queda pendiente

| Comprobación | Resultado |
|---|---|
| Tests de Vitest | ✅ 92 |
| Tests GJS (`pnpm test:gjs`) | ✅ 17: 9 del dispositivo con teclado simulado, 7 del servicio de layout y 1 de la caché en disco |
| Mutaciones (handshake invertido, sin aislamiento de listeners) | ✅ los tests correspondientes fallan (3) |
| Dispositivo refactorizado con el teclado real | ✅ conecta, protocolo 5, firmware `aOa9o/nlzDl9` |
| Último layout conocido con el sistema real | ✅ `probe:layout aOa9o newRev2 --offline` → `stale-cache`, revisión `nlzDl9` |
| **Criterio 1: latencia** | ✅ cambio de capa → fotograma pintado: mediana 14,7 ms, máximo 22,3 ms (30 cambios, Shell anidada) |
| **Criterio 8: flasheo real** | ⏳ pendiente; el usuario lo hará más adelante (pasos en `phase-8-robustness.md`) |
| `smoke` | ✅ sin restos al desactivar |

## v0.5.1: repositorio público y badges

**Fecha:** 2026-09-27
**Resultado:** ✅ solicitada por el usuario

| Comprobación | Resultado |
|---|---|
| URL del repositorio en `metadata.json` y `package.json` | ✅ `https://github.com/ajmasia/gnome-shell-extension-zsa-helper` |
| Badges del README | ✅ las 9 URLs responden; los dinámicos muestran versión, licencia (GPL-3.0) y último commit |
| Firmas en GitHub | ✅ commits y etiquetas verificados tras registrar la clave de firma |
| `pnpm test` / `test:gjs` / `typecheck` / `smoke` | ✅ sin regresiones |
