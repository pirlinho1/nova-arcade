/* Memory (Concentración) — NOVA ARCADE */
(function () {
  const gridEl = document.getElementById("grid");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const movesEl = document.getElementById("moves"), pairsEl = document.getElementById("pairs"), timeEl = document.getElementById("time"), bestEl = document.getElementById("best");

  const SETS = {
    emojis: ["🎮","👾","🚀","⭐","🍄","💎","🔥","⚡","🎲","🏆","🌙","🍒","🤖","👻","🎯","🛸","🐉","🍀"],
    animals: ["🐶","🐱","🦊","🐼","🦁","🐸","🐵","🐧","🦄","🐙","🐝","🦋","🐢","🦉","🐬","🐯","🦓","🦘"],
    symbols: ["♠","♥","♦","♣","★","☾","✦","✿","❄","☀","☂","☯","✪","✺","❖","✚","◆","●"],
  };
  let cfg = Object.assign({ size: "12", set: "emojis", glow: true }, NovaSettings.loadCfg("memory"));
  let cards, first, second, lock, moves, matched, total, t0, timer, state = "idle";

  function bestKey(){ return "memory-best-" + cfg.size; }
  function showBest(){ const b = localStorage.getItem(bestKey()); bestEl.textContent = b ? b : "—"; }

  function build(){
    const pairs = parseInt(cfg.size) / 2;
    const pool = SETS[cfg.set].slice(0, pairs);
    cards = [...pool, ...pool].map((sym,i)=>({ sym, id:i, flip:false, done:false }));
    for(let i=cards.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [cards[i],cards[j]]=[cards[j],cards[i]]; }
    first=second=null; lock=false; moves=0; matched=0; total=pairs;
    const cols = Math.ceil(Math.sqrt(cards.length));
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridEl.innerHTML = "";
    cards.forEach((c,idx)=>{
      const el = document.createElement("div"); el.className="mcard"; el.dataset.i=idx;
      el.innerHTML = `<div class="face back">?</div><div class="face front">${c.sym}</div>`;
      el.onclick = ()=>flip(idx, el);
      c.el = el; gridEl.appendChild(el);
    });
    movesEl.textContent=0; pairsEl.textContent=`0/${total}`; timeEl.textContent="0:00"; showBest();
  }
  function start(){ if(state==="play")return; if(state!=="play") build(); state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("neon",96); t0=Date.now(); clearInterval(timer); timer=setInterval(tick,500); }
  function tick(){ const s=((Date.now()-t0)/1000)|0; timeEl.textContent = `${(s/60)|0}:${String(s%60).padStart(2,"0")}`; }

  function flip(idx, el){
    if(state!=="play"||lock) return; const c=cards[idx]; if(c.flip||c.done) return;
    c.flip=true; el.classList.add("flip"); NovaAudio.play("move");
    if(!first){ first={c,el}; return; }
    second={c,el}; moves++; movesEl.textContent=moves; lock=true;
    if(first.c.sym===second.c.sym){
      setTimeout(()=>{ first.c.done=second.c.done=true; first.el.classList.add("done"); second.el.classList.add("done"); matched++; pairsEl.textContent=`${matched}/${total}`; NovaAudio.play("point"); first=second=null; lock=false; if(matched===total) win(); }, 350);
    } else {
      setTimeout(()=>{ first.c.flip=second.c.flip=false; first.el.classList.remove("flip"); second.el.classList.remove("flip"); NovaAudio.play("hit"); first=second=null; lock=false; }, 800);
    }
  }
  function win(){
    state="over"; clearInterval(timer); NovaAudio.stopMusic(); NovaAudio.play("win");
    const prev=localStorage.getItem(bestKey()); if(!prev || moves < +prev){ localStorage.setItem(bestKey(), moves); showBest(); }
    ovTitle.textContent="¡COMPLETADO!"; ovTitle.className="win"; ovMsg.textContent=`${moves} intentos · ${timeEl.textContent}`; ovBtn.textContent="↻ Jugar de nuevo"; ov.classList.add("show");
  }

  ovBtn.onclick=()=>{ if(state==="over"){ build(); } start(); };
  document.getElementById("restart").onclick=()=>{ clearInterval(timer); build(); state="idle"; ovTitle.textContent="MEMORY"; ovTitle.className=""; ovMsg.textContent="Encuentra todas las parejas."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({ gameId:"memory", onChange:(k)=>{ clearInterval(timer); build(); state="idle"; ov.classList.add("show"); }, extra:[
    { title:"Juego", rows:[
      { type:"select", key:"size", label:"Cartas", default:"12", options:[{value:"8",label:"8 (fácil)"},{value:"12",label:"12"},{value:"16",label:"16"},{value:"24",label:"24 (difícil)"}] },
      { type:"select", key:"set", label:"Símbolos", default:"emojis", options:[{value:"emojis",label:"Arcade"},{value:"animals",label:"Animales"},{value:"symbols",label:"Símbolos"}] },
    ]},
    { title:"Controles", rows:[ { type:"keys", label:"Voltear carta", value:"Clic / toque" } ]},
  ]});
  build();
})();
