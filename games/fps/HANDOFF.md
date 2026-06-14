# Strike Force (clon CS) — HANDOFF

Reescritura desde 0 de un clon táctico estilo Counter-Strike. **Uso personal/privado.**
Continuar desde aquí en una sesión nueva.

## Dónde vive / cómo correrlo
- Repo: `~/Projects/nova-arcade` (GitHub `pirlinho1/nova-arcade`, **PÚBLICO** desde 14-jun-2026).
- Juego: `games/fps/index.html` + `games/fps/game.js` (Three.js ESM por CDN, importmap a `three@0.161.0`, **sin npm**).
- **En vivo (auto-deploy en cada push a main):** https://pirlinho1.github.io/nova-arcade/games/fps/
- Local: `cd ~/Projects/nova-arcade && python3 -m http.server 8090` → `http://localhost:8090/games/fps/`

## Despliegue (IMPORTANTE — esto causó que Kike viera código viejo durante iteraciones)
- GitHub Pages **solo funciona con repo público** (gratis). El repo se hizo público y Pages quedó activo (source=main /). Auto-build en cada push.
- Vercel existe pero estaba **obsoleto y sin token** (`~/.env.d/vercel.env` no existe). No usarlo salvo que Kike cree el token.
- Push con PAT (no interactivo, sin persistir el token):
  ```bash
  set -a; . ~/.env.d/github_pat.env; set +a; TOK="${GITHUB_PAT:-$GH_TOKEN}"
  git -c credential.helper= push "https://pirlinho1:${TOK}@github.com/pirlinho1/nova-arcade.git" main 2>&1 | sed -E "s/${TOK}/***/g"
  ```
- Verificar en runtime: `node --check games/fps/game.js` + Playwright vía CDP en `:9222` con venv `~/.jarvis_venv` (Brave abierto). Patrón en `/tmp/sf.py`.

## Restricciones IP (acordadas con Kike)
- Uso privado. **Estructura/topología de dust2 = OK** (layout funcional no protegido). **NO usar texturas reales ni el nombre "dust2".** Texturas: procedurales originales.
- **Nombres reales de armas = OK** (Glock, Deagle, AK-47, AWP, etc.).

## Estado ACTUAL (Paso 1 — HECHO)
`game.js` contiene:
- **Mapa 3D topología dust2** por rasterización: `AREAS` (rects de celda) → `grid[M][N]` (1=muro,0=suelo). `N=46, M=42, CS=2.4`, alto muro `WH=4.2`. Áreas: T spawn, mid + mid doors, catwalk/A short, largo A, sitio A, CT spawn, túneles (lower/upper) a B, sitio B, B doors. Todo **conectado**. Muros fusionados por fila (menos draw calls) en `wallAABBs`/cajas. Suelo arena + cielo por **ShaderMaterial** (gradiente desértico).
- **Movimiento CS** (`updatePlayer`): counter-strafe (velocidad con ACCEL=75/FRIC=90 en suelo; paso hacia velocidad objetivo → parada seca al pulsar opuesto), `wishdir` CORREGIDO (forward=(-sinY,-cosY), right=(cosY,-sinY)), **agacharse Ctrl** (baja cámara a 1.05, ralentiza, +precisión), andar Shift (lento+silencioso), salto, colisión por grid (`collide`/`solidW`).
- **AK-47** (`AK` + `fire`): recoil **pattern determinista** (`AK.pattern`) aplicado a la cámara, recuperación solo tras 180 ms sin disparar (+ reset de `sprayIdx`); precisión por `currentInacc()` (parado≈perfecto, +movimiento/aire); **hitbox cabeza ×4.2**; tracers, fx de impacto, hitmarker, recarga (R), sonido sintetizado.
- **Dummies tipo Lego/Roblox** (`buildDummy`/`spawnEnemies`) estáticos en sitios para tirar. Minimapa top-down. HUD: vida/munición/arma.
- Mira dinámica verde (refleja imprecisión). PointerLockControls (clic para capturar).

## TODO (orden pedido por Kike) — Paso 2+
1. **Refactor a `WEAPONS` data-driven** (ya casi: `AK` es el molde). Tabla con: `dmg, rof, mag, reserve, reload, auto, range, headMult, accStand, accMove, accAir, moveSpd, pattern[], price, category, scope?, silencer?`. Cambio de arma (teclas/rueda) y **viewmodel** por arma.
2. **Arsenal completo** con recoil/daño/cadencia/sonido/precio propios y **silenciador** donde aplique:
   - Pistolas: **Glock** (silenciable), **Deagle**, **CZ**, (USP-like con silenciador).
   - SMG: **UMP**, **MP5**, **MP7**, **P90**.
   - Fusiles: **AK-47** (hecho), **M4** (silenciable), **Galil**, **Famas**, **XM8**.
   - Sniper: **AWP** (scope clic-der, 1-shot), **Scout** (scope, móvil).
   - Escopeta: **MAG7**. MG: (p.ej. estilo Negev) ráfaga larga, impreciso.
   Cada categoría: cadencia/precisión/velocidad/penetración distintas.
3. **Granadas**: humo **volumétrico** (esfera de partículas que **bloquea raycasts/visión** durante ~15s), **flash** (overlay blanco por ángulo+oclusión al objetivo), **molotov/incendiaria** (zona de daño en suelo). HE opcional. Lanzamiento con arco + rebote (ver `throwGrenade` viejo en git si sirve).
4. **Wallbang**: material por muro (madera/chapa/hormigón) → `rayWall` continúa atravesando con **falloff de daño** según material/grosor.
5. **Bots con IA** por equipos: navegación por waypoints del mapa, **peek/hold de ángulos**, comprar, plantar/desactivar. (El motor v2 anterior tenía bots con LOS/persecución — reutilizable como base; está en el historial git antes de `61c3834`.)
6. **C4 + defuse**, **economía + menú de compra** (el `index.html` ya tiene contenedor `#buy` y HUD de dinero/granadas de la versión anterior).
7. Rondas CT vs T, condiciones de victoria, marcador.

## Tuning pendiente / notas
- El mapa es una **aproximación** de dust2: refinar fidelidad (pozo de largo A, catwalk, plataforma de B, mid doors + xbox, dobles). Editar `AREAS`.
- Valores del **recoil del AK** a calibrar para que se sienta como el real.
- Enemigos son **dummies estáticos** (sin IA todavía).
- Historial git útil: la versión 3D previa (commit `e705197` y anteriores) tenía economía/compra/granadas/bots/recoil ADS — canibalizar lo que sirva.

## Memoria JARVIS relacionada
Ver `project_nova_arcade_quality.md` (roadmap de calidad NOVA ARCADE) y `reference_paths.md`.
