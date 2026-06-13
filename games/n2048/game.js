/* 2048 — NOVA ARCADE */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const scoreEl = document.getElementById("score"), bestEl = document.getElementById("best");
  let cfg = Object.assign({ size: "4", glow: true }, NovaSettings.loadCfg("n2048"));
  let N, cell, gap = 10, grid, score, state = "idle", won = false;
  let best = +(localStorage.getItem("n2048-best") || 0); bestEl.textContent = best;

  const PALETTE = ["--surface-2","--accent","--accent-3","--accent-2"];
  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function tileColor(v){ const i = Math.log2(v) | 0; return css(PALETTE[Math.min(i, PALETTE.length - 1)]); }

  function setup(){ N = parseInt(cfg.size); cell = (420 - gap * (N + 1)) / N; grid = Array.from({length:N},()=>Array(N).fill(0)); score=0; won=false; scoreEl.textContent=0; add(); add(); draw(); }
  function add(){ const e=[]; for(let y=0;y<N;y++)for(let x=0;x<N;x++) if(!grid[y][x]) e.push([x,y]); if(!e.length) return; const [x,y]=e[(Math.random()*e.length)|0]; grid[y][x]=Math.random()<0.9?2:4; }
  function start(){ if(state==="play")return; if(state!=="play") setup(); state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("neon",100); }

  function slide(row){ // mover/mezclar hacia izquierda
    let a = row.filter(v=>v); let merged=false; let gained=0;
    for(let i=0;i<a.length-1;i++){ if(a[i]===a[i+1]){ a[i]*=2; gained+=a[i]; if(a[i]===2048) won=true; a.splice(i+1,1); merged=true; } }
    while(a.length<N) a.push(0);
    return { row:a, changed: merged || row.some((v,i)=>v!==a[i]), gained };
  }
  // columnas: implementación clara por transposición
  let lastGained = 0;
  function moveCols(dir){
    lastGained = 0; let changed=false;
    for(let x=0;x<N;x++){
      let col=[]; for(let y=0;y<N;y++) col.push(grid[y][x]);
      if(dir==="down") col.reverse();
      const r=slide(col); lastGained+=r.gained;
      let nc=r.row; if(dir==="down") nc=nc.reverse();
      for(let y=0;y<N;y++){ if(grid[y][x]!==nc[y]) changed=true; grid[y][x]=nc[y]; }
    }
    return changed;
  }
  // rehacer move() limpio
  function doMove(dir){
    if(state==="idle"||state==="over"){ start(); }
    if(state!=="play") return;
    lastGained=0; let changed=false;
    if(dir==="left"||dir==="right"){
      for(let y=0;y<N;y++){ let row=grid[y].slice(); if(dir==="right") row.reverse(); const r=slide(row); lastGained+=r.gained; let nr=r.row; if(dir==="right") nr.reverse(); for(let x=0;x<N;x++){ if(grid[y][x]!==nr[x]) changed=true; grid[y][x]=nr[x]; } }
    } else { changed = moveCols(dir); }
    if(!changed) return;
    score+=lastGained; scoreEl.textContent=score; NovaAudio.play(lastGained?"eat":"move"); add(); draw();
    if(won) return win();
    if(!canMove()) return over();
  }
  function canMove(){ for(let y=0;y<N;y++)for(let x=0;x<N;x++){ if(!grid[y][x])return true; if(x<N-1&&grid[y][x]===grid[y][x+1])return true; if(y<N-1&&grid[y][x]===grid[y+1][x])return true; } return false; }

  function draw(){
    ctx.fillStyle=css("--bg-2"); ctx.fillRect(0,0,420,420);
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const px=gap+x*(cell+gap), py=gap+y*(cell+gap), v=grid[y][x];
      ctx.fillStyle = v? tileColor(v) : css("--surface-2");
      if(v&&cfg.glow){ ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=12; }
      ctx.beginPath(); ctx.roundRect(px,py,cell,cell,8); ctx.fill(); ctx.shadowBlur=0;
      if(v){ ctx.fillStyle = v<=4? css("--text") : "#06060c"; ctx.font=`700 ${Math.max(18, cell/2.6)}px "Chakra Petch", sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(v, px+cell/2, py+cell/2+2); }
    }
  }
  function win(){ state="over"; NovaAudio.stopMusic(); NovaAudio.play("win"); saveBest(); ovTitle.textContent="¡2048!"; ovTitle.className="win"; ovMsg.textContent=`Puntos: ${score}. Sigue jugando con ↻`; ovBtn.textContent="↻ Nuevo"; ov.classList.add("show"); won=false; }
  function over(){ state="over"; NovaAudio.stopMusic(); NovaAudio.play("over"); saveBest(); ovTitle.textContent="SIN MOVIMIENTOS"; ovTitle.className="lose"; ovMsg.textContent=`Puntos: ${score} · Récord: ${best}`; ovBtn.textContent="↻ Reintentar"; ov.classList.add("show"); }
  function saveBest(){ if(score>best){ best=score; localStorage.setItem("n2048-best",best); bestEl.textContent=best; } }

  const keymap={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",w:"up",s:"down",a:"left",d:"right",W:"up",S:"down",A:"left",D:"right"};
  document.addEventListener("keydown",e=>{ const d=keymap[e.key]; if(d){ e.preventDefault(); doMove(d); } });
  document.querySelectorAll("#dpad button").forEach(b=>b.onclick=()=>doMove(b.dataset.dir));
  let tsx,tsy; cv.addEventListener("touchstart",e=>{tsx=e.touches[0].clientX;tsy=e.touches[0].clientY;},{passive:true});
  cv.addEventListener("touchend",e=>{const dx=e.changedTouches[0].clientX-tsx,dy=e.changedTouches[0].clientY-tsy; if(Math.max(Math.abs(dx),Math.abs(dy))<20)return; doMove(Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up"));});
  ovBtn.onclick=()=>{ if(state==="over"){ setup(); } start(); };
  document.getElementById("restart").onclick=()=>{ setup(); state="idle"; ovTitle.textContent="2048"; ovTitle.className=""; ovMsg.textContent="Flechas / WASD para juntar fichas iguales."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({ gameId:"n2048", onChange:(k)=>{ if(k==="size"){ setup(); state="idle"; ov.classList.add("show"); } else draw(); }, extra:[
    { title:"Juego", rows:[ { type:"select", key:"size", label:"Tamaño", default:"4", options:[{value:"4",label:"4×4 (clásico)"},{value:"5",label:"5×5"},{value:"6",label:"6×6 (fácil)"}] } ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Mover", value:"Flechas / WASD / swipe" } ]},
  ]});
  document.addEventListener("nova-theme-change", draw);
  setup();
})();
