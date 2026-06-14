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
  let cards, first, second, lock, moves, matched, total, t0, timer, state = "idle", streak = 0;

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._mA || (window._mA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "sine"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }

  function bestKey(){ return "memory-best-" + cfg.size; }
  function showBest(){ const b = localStorage.getItem(bestKey()); bestEl.textContent = b ? b : "—"; }

  function build(){
    const pairs = parseInt(cfg.size) / 2;
    const pool = SETS[cfg.set].slice(0, pairs);
    cards = [...pool, ...pool].map((sym,i)=>({ sym, id:i, flip:false, done:false }));
    for(let i=cards.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [cards[i],cards[j]]=[cards[j],cards[i]]; }
    first=second=null; lock=false; moves=0; matched=0; total=pairs; streak=0;
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
    c.flip=true; el.classList.add("flip"); tone(440, .05, "sine", .3);
    if(!first){ first={c,el}; return; }
    second={c,el}; moves++; movesEl.textContent=moves; lock=true;
    if(first.c.sym===second.c.sym){
      streak++;
      setTimeout(()=>{
        first.c.done=second.c.done=true;
        first.el.classList.add("done","matchpop"); second.el.classList.add("done","matchpop");
        setTimeout(()=>{ first.el && first.el.classList.remove("matchpop"); second.el && second.el.classList.remove("matchpop"); }, 460);
        matched++; pairsEl.textContent=`${matched}/${total}`;
        const base = 600 + Math.min(8, streak) * 80; tone(base, .1, "triangle", .45, base*1.5); setTimeout(()=>tone(base*1.5, .12, "triangle", .4), 80);
        if(streak >= 2){ const chip = document.getElementById("streak"); if(chip){ chip.textContent = "🔥 Racha ×"+streak; chip.classList.add("on"); clearTimeout(chip._t); chip._t=setTimeout(()=>chip.classList.remove("on"), 1400); } }
        first=second=null; lock=false; if(matched===total) win();
      }, 320);
    } else {
      streak = 0;
      first.el.classList.add("bad"); second.el.classList.add("bad"); tone(220, .12, "sawtooth", .35, 140);
      setTimeout(()=>{ first.c.flip=second.c.flip=false; first.el.classList.remove("flip","bad"); second.el.classList.remove("flip","bad"); first=second=null; lock=false; }, 760);
    }
  }
  function win(){
    state="over"; clearInterval(timer); NovaAudio.stopMusic(); NovaAudio.play("win");
    const prev=localStorage.getItem(bestKey()); const isRecord = !prev || moves < +prev; if(isRecord){ localStorage.setItem(bestKey(), moves); showBest(); }
    // estrellas: 3 si te acercas al mínimo de intentos (=total), baja con los fallos
    const extra = moves - total; const stars = extra <= Math.ceil(total*0.4) ? 3 : extra <= total ? 2 : 1;
    [1320,1560,1760].slice(0,stars).forEach((f,i)=>setTimeout(()=>tone(f,.16,"triangle",.5),i*140));
    ovTitle.textContent="¡COMPLETADO!"; ovTitle.className="win";
    ovMsg.innerHTML=`<div class="stars">${"★".repeat(stars)}${"☆".repeat(3-stars)}</div>${moves} intentos · ${timeEl.textContent}${isRecord?" · 🏆 ¡Récord!":""}`;
    ovBtn.textContent="↻ Jugar de nuevo"; ov.classList.add("show");
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
