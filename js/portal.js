/* NOVA ARCADE — catálogo del portal */
const CATALOG = [
  { id: "snake",   title: "Snake",        cat: "Clásicos",   emoji: "🐍", color: "#b6ff3b", ready: true,  url: "games/snake/",  desc: "El clásico. Crece sin chocar." },
  { id: "tetris",  title: "Blocks",       cat: "Puzzle",     emoji: "🧱", color: "#22d3ee", ready: true,  url: "games/tetris/", desc: "Encaja piezas, limpia líneas." },
  { id: "pacman",  title: "Maze Muncher", cat: "Clásicos",   emoji: "🟡", color: "#ffe14d", ready: true,  url: "games/pacman/", desc: "Come todo, esquiva fantasmas." },
  { id: "n2048",   title: "2048",         cat: "Puzzle",     emoji: "🔢", color: "#f0a500", ready: true,  url: "games/n2048/",  desc: "Junta fichas hasta 2048." },
  { id: "memory",  title: "Memory",       cat: "Puzzle",     emoji: "🧠", color: "#a98bff", ready: true,  url: "games/memory/", desc: "Encuentra todas las parejas." },
  { id: "damas",   title: "Damas",        cat: "Mesa",       emoji: "⛀",  color: "#22d3ee", ready: true,  url: "games/damas/",  desc: "Damas vs IA, captura obligatoria." },
  { id: "chess",   title: "Ajedrez",      cat: "Mesa",       emoji: "♟️", color: "#c0c0e0", ready: true,  url: "games/chess/",  desc: "Ajedrez completo vs IA (minimax)." },
  { id: "solitaire",title:"Solitario",    cat: "Cartas",     emoji: "🃏", color: "#3bff9e", ready: true,  url: "games/solitaire/", desc: "Klondike. Ordena los palos." },
  { id: "fps",     title: "Strike 5v5",   cat: "Acción",     emoji: "🔫", color: "#ff2e88", ready: false, desc: "FPS táctico, C4, mapas y arsenal." },
  { id: "kart",    title: "Turbo Cups",   cat: "Carreras",   emoji: "🏎️", color: "#ff7b2e", ready: false, desc: "Copas, pistas, powerups, tuning." },
  { id: "pong",    title: "HaxBall FC",   cat: "Deportes",   emoji: "⚽", color: "#3bff9e", ready: false, desc: "Fútbol físico 1v1 / equipos." },
  { id: "parchis", title: "Parchís",      cat: "Mesa",       emoji: "🎲", color: "#c0c0e0", ready: false, desc: "Parchís 2–4 jugadores." },
  { id: "cards",   title: "Card Room",    cat: "Cartas",     emoji: "🂡", color: "#22d3ee", ready: false, desc: "UNO, póker, carioca." },
  { id: "slots",   title: "Lucky Spin",   cat: "Casino",     emoji: "🎰", color: "#ffd14d", ready: false, desc: "Tragaperras con jackpots." },
  { id: "platform",title: "Jump Quest",   cat: "Plataformas",emoji: "🍄", color: "#ff5630", ready: false, desc: "Plataformas tipo Mario / Cuphead." },
  { id: "rpg",     title: "Soul Tale",    cat: "RPG",        emoji: "⚔️", color: "#a98bff", ready: false, desc: "RPG narrativo tipo Undertale." },
  { id: "tycoon",  title: "Biz Tycoon",   cat: "Gestión",    emoji: "🍕", color: "#ff9d2e", ready: false, desc: "Maneja pizzería, súper, etc." },
  { id: "sim",     title: "Sim Lab",      cat: "Simuladores",emoji: "🛠️", color: "#3bd1ff", ready: false, desc: "Simuladores varios." },
  { id: "more",    title: "+ Sorpresas",  cat: "Originales",  emoji: "✨", color: "#b6ff3b", ready: false, desc: "Ideas originales por venir." },
];

const grid = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const cats = ["Todos", ...Array.from(new Set(CATALOG.map(g => g.cat)))];
let active = "Todos";

document.getElementById("st-ready").textContent = CATALOG.filter(g => g.ready).length;
document.getElementById("st-total").textContent = CATALOG.length;
document.getElementById("year").textContent = new Date().getFullYear();

function render() {
  grid.innerHTML = "";
  CATALOG.filter(g => active === "Todos" || g.cat === active).forEach((g, i) => {
    const card = document.createElement(g.ready ? "a" : "div");
    card.className = "card" + (g.ready ? "" : " soon");
    card.style.animationDelay = (i * 40) + "ms";
    card.style.setProperty("--card-c", g.color);
    if (g.ready) { card.href = g.url; }
    card.innerHTML = `
      <div class="art" style="background:radial-gradient(120px 80px at 50% 30%, color-mix(in srgb, ${g.color} 30%, transparent), transparent), var(--surface-2)">
        <span class="emoji">${g.emoji}</span>
      </div>
      <span class="badge ${g.ready ? "ready" : "soon"}">${g.ready ? "Jugar" : "Pronto"}</span>
      <div class="meta">
        <div class="cat">${g.cat}</div>
        <h3>${g.title}</h3>
        <div class="desc">${g.desc}</div>
      </div>`;
    if (g.ready) card.addEventListener("click", () => { try { NovaAudio.play("ui"); } catch (e) {} });
    grid.appendChild(card);
  });
}

cats.forEach(c => {
  const chip = document.createElement("button");
  chip.className = "chip" + (c === active ? " active" : "");
  chip.textContent = c;
  chip.onclick = () => { active = c; filtersEl.querySelectorAll(".chip").forEach(x => x.classList.remove("active")); chip.classList.add("active"); try { NovaAudio.play("ui"); } catch (e) {} render(); };
  filtersEl.appendChild(chip);
});

// engranaje del portal (solo audio + tema)
NovaSettings.mount({ gameId: "portal", extra: [] });
render();
