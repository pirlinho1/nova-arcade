# NOVA ARCADE 🕹️

Portal de juegos web (estático, sin dependencias, sin build). Cada juego trae su propio menú de
configuración (volumen general / música / SFX con mute, opciones del juego, controles, gráficos) y
soporta temas (light/dark, extensible). Estética arcade neón con scanlines, fuentes Bungee + Chakra Petch.

## Cómo abrir
- Doble clic en `index.html`, **o** servir la carpeta:
  ```bash
  cd ~/Projects/nova-arcade && python3 -m http.server 8777
  # http://localhost:8777
  ```

## Estado
**Jugables ahora (3):** Snake · Blocks (Tetris) · Maze Muncher (Pac-Man).
**En el roadmap (catálogo ya visible como "Pronto"):** FPS 5v5, Kart, HaxBall, Ajedrez/Damas/Parchís,
Cartas (UNO/solitario/póker), Tragaperras, Plataformas (Mario/Cuphead), RPG (Undertale),
Tycoon (pizzería/súper), Simuladores, y originales.

## Arquitectura (extensible)
```
css/theme.css     sistema de diseño + temas (añadir tema = bloque de variables + registro en theme.js)
css/portal.css    portal (hero, grid, cartas)
css/game.css      shell común de juegos (HUD, canvas, overlays, dpad táctil)
js/theme.js       gestor de temas (registro + persistencia)
js/audio.js       audio WebAudio (música procedural + SFX, volumen/mute por canal, persistente)
js/settings.js    panel de configuración reutilizable (audio + tema + secciones propias del juego)
js/portal.js      catálogo
games/<id>/        cada juego: index.html + <id>.js
```

### Añadir un juego nuevo
1. Crear `games/<id>/index.html` (copiar el de snake) + `<id>.js`.
2. Llamar `NovaSettings.mount({ gameId, extra:[...] })` con sus secciones (controles, gráficos…).
3. Usar `NovaAudio` para música/SFX y leer colores con `getComputedStyle` (sigue el tema).
4. Añadir la entrada al array `CATALOG` en `js/portal.js` con `ready:true`.

### Añadir un tema nuevo
1. Añadir bloque `[data-theme="x"] { --bg:…; --accent:…; }` en `css/theme.css`.
2. Registrar `{ id:"x", name:"…", swatch:"…" }` en `THEMES` de `js/theme.js`. Aparece solo en el selector.

Hecho con el ecosistema JARVIS.
