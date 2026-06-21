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
- Push con PAT (no interactivo, sin persistir el token). **La variable se llama `GITHUB_TOKEN`** (no `GITHUB_PAT` ni `GH_TOKEN`):
  ```bash
  set -a; . ~/.env.d/github_pat.env; set +a; TOK="$GITHUB_TOKEN"
  git -c credential.helper= push "https://pirlinho1:${TOK}@github.com/pirlinho1/nova-arcade.git" main 2>&1 | sed -E "s/${TOK}/***/g"
  ```
- Verificar en runtime: `node --check games/fps/game.js` + Playwright vía CDP en `:9222` con venv `~/.jarvis_venv` (Brave abierto). Patrón en `/tmp/sf.py`.

## Restricciones IP (acordadas con Kike)
- Uso privado. **Estructura/topología de dust2 = OK** (layout funcional no protegido). **NO usar texturas reales ni el nombre "dust2".** Texturas: procedurales originales.
- **Nombres reales de armas = OK** (Glock, Deagle, AK-47, AWP, etc.).

## Estado ACTUAL (Pasos 1 y 2 — HECHOS; último commit `6762e99`)
`game.js` (~597 líneas) contiene:
- **Mapa 3D topología dust2** por rasterización: `AREAS` (rects de celda) → `grid[M][N]` (1=muro,0=suelo). `N=46, M=42, CS=2.4`, alto muro `WH=4.2`. Áreas: T spawn, mid + mid doors, catwalk/A short, largo A, sitio A, CT spawn, túneles (lower/upper) a B, sitio B, B doors. Todo **conectado**. Muros fusionados por fila. Suelo arena + cielo por **ShaderMaterial**.
- **Movimiento CS** (`updatePlayer`): counter-strafe (ACCEL=75/FRIC=90; parada seca al pulsar opuesto), `wishdir` CORREGIDO (forward=(-sinY,-cosY), right=(cosY,-sinY)), **agacharse Ctrl**, andar Shift, salto, colisión por grid (`collide`/`solidW`). Cámara parte mirando al frente.
- **Arsenal completo data-driven** (`WEAPONS`, 16 entradas + cuchillo): glock, usp(silenciador), cz, deagle (pistolas); mp5, ump, mp7, p90 (SMG); ak47, m4(silenciador), galil, famas, xm8 (fusiles); awp, scout (snipers con `scope`/`scopeFov`); mag7 (`pellets:8`); negev (mg). Cada una con `{name,cat,price,dmg,rof,mag,reserve,reload,auto,range,headMult,accStand,accMove,accAir,moveSpd,pat,scope?,silencer?,pellets?,hipAcc?,scopeFov?}`. Patrones de recoil deterministas vía `mkPat(len,climb,drift)` (AK con patrón hecho a mano).
- **Disparo** (`fire`): recoil por patrón a la cámara (recupera tras dejar de disparar), cono de precisión `currentInacc()` (parado≈perfecto, +mov/aire, ×.6 agachado, ×.12 con mira), pellets para escopeta, raycast vs `enemyMeshes` + `rayWall()`, **hitbox cabeza** (`headMult` por arma). Tracers, hitmarker, recarga (R), sonidos sintetizados por categoría.
- **Tienda + economía** (`openBuy`/`buyWeapon`, tecla **B**): sandbox `money=16000`, botones por categoría (`SHOP`), pistola→slot2, resto→slot1. Loadout `slots {1:primary,2:secondary,3:knife}`, `inst(id)`, `setLoadout`, `switchTo` (teclas 1/2/3). **Mira de sniper** (clic-der, `scoped`+`scopeFov`+viñeta ADS). **Silenciador** (tecla V) en USP/M4.
- **Viewmodels por arma** (`buildWeaponViewModel`) montados en la cámara, con **recoil del viewmodel** (kick + retorno interpolado).
- **Estilos de modelo de jugador** (selector arriba a la derecha): `buildDummyByStyle` con LEGO RETRO / CYBER GLOW / MILITAR REALISTA, y **GLTF** que carga `Soldier.glb` async desde el repo three.js (mixers de animación; fallback a procedural si falla la descarga).
- **Dummies** estáticos en sitios para tirar (sin IA todavía). Minimapa top-down. HUD vida/armadura/dinero/munición/arma. Mira dinámica.

## TODO (orden pedido por Kike) — Paso 3+
1. **Granadas**: humo **volumétrico** (esfera de partículas que **bloquea raycasts/visión** durante ~15s), **flash** (overlay blanco por ángulo+oclusión al objetivo), **molotov/incendiaria** (zona de daño en suelo). HE opcional. Lanzamiento con arco + rebote (ver `throwGrenade` viejo en git si sirve).
2. **Wallbang**: material por muro (madera/chapa/hormigón) → `rayWall` continúa atravesando con **falloff de daño** según material/grosor.
3. **Bots con IA** por equipos: navegación por waypoints del mapa, **peek/hold de ángulos**, comprar, plantar/desactivar. (El motor v2 anterior tenía bots con LOS/persecución — reutilizable como base; está en el historial git antes de `61c3834`.) Reemplazan a los dummies estáticos actuales.
4. **C4 + defuse** y **rondas CT vs T** con economía real entre rondas (compra ya existe; falta el bucle de ronda), condiciones de victoria, marcador.

## Tuning pendiente / notas
- El mapa es una **aproximación** de dust2: refinar fidelidad (pozo de largo A, catwalk, plataforma de B, mid doors + xbox, dobles). Editar `AREAS`.
- Valores de **recoil/precisión por arma** a calibrar (sobre todo AK, M4, Deagle 1-tap) para que se sientan como el real.
- Enemigos son **dummies estáticos** (sin IA todavía) → los reemplaza el Paso 3 (bots IA).
- **Verificación rápida en runtime** (lo último confirmado): `node --check games/fps/game.js` pasa; tienda con ~17 botones; cambio de arma OK; viewmodels y estilos de modelo (incl. GLTF async) funcionando. Re-verificar tras cada cambio con Playwright/CDP `:9222`.
- Historial git útil: la versión 3D previa (commit `e705197` y anteriores) tenía economía/compra/granadas/bots/recoil ADS — canibalizar lo que sirva.

## Memoria JARVIS relacionada
Ver `project_nova_arcade_quality.md` (roadmap de calidad NOVA ARCADE) y `reference_paths.md`.
