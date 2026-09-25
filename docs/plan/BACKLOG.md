# Backlog

Mejoras pendientes tras la v0.4.1, recogidas del análisis de debilidades del 2026-09-25. Cada
PRP es autocontenido y se puede abordar en cualquier momento, con el mismo flujo de siempre:
commits atómicos firmados, validación con el usuario, commit de release y etiqueta.

| Prioridad | PRP | Versión sugerida | Resumen |
|---|---|---|---|
| ✅ Hecha (v0.5.0) | [Phase 8: robustez](phase-8-robustness.md) | 0.5.0 | Tests de la capa GJS, último layout conocido y latencia medida. **Pendiente:** el flasheo real (criterio 8), que hará el usuario |
| 🟠 Alta, cuando haga falta | [Phase 9: GNOME 49](phase-9-gnome-49.md) | 0.6.0 | Portar la extensión y los tipos cuando el sistema pase a GNOME 49 |
| 🟡 Media | [Phase 10: precisión de las etiquetas](phase-10-label-accuracy.md) | 0.7.0 | Distribuciones que no son US (xkbcommon) y herencia en cadena de las capas transparentes |
| 🟢 Baja | [Phase 11: mantenimiento](phase-11-housekeeping.md) | 0.x.y | Limpieza de la caché, varios teclados ZSA y E/S síncrona restante |

Las versiones son orientativas: si se aborda antes una fase posterior, se numera según el orden
real de publicación.
