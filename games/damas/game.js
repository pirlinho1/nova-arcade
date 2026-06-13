/* Damas (Checkers) — NOVA ARCADE. Jugador=+ (abajo, sube), IA=- (arriba, baja). */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const turnEl = document.getElementById("turn"), pcEl = document.getElementById("pcount"), acEl = document.getElementById("acount");
  const S = 8, CELL = 60;
  let cfg = Object.assign({ depth: "3", forced: true, glow: true }, NovaSettings.loadCfg("damas"));
  let board, turn, sel, legal, state = "idle", busy = false;

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function init(){
    board = Array.from({length:S},()=>Array(S).fill(0));
    for(let r=0;r<3;r++)for(let c=0;c<S;c++) if((r+c)%2===1) board[r][c]=-1;       // IA arriba
    for(let r=5;r<8;r++)for(let c=0;c<S;c++) if((r+c)%2===1) board[r][c]=1;        // jugador abajo
    turn=1; sel=null; legal=[]; updateHUD(); draw();
  }
  function side(v){ return v>0?1:v<0?-1:0; }
  function king(v){ return Math.abs(v)===2; }
  function inb(r,c){ return r>=0&&r<S&&c>=0&&c<S; }
  function clone(b){ return b.map(r=>r.slice()); }

  function dirsFor(v){ const k=king(v); if(k) return [[1,1],[1,-1],[-1,1],[-1,-1]]; return v>0?[[-1,1],[-1,-1]]:[[1,1],[1,-1]]; }
  function capSeq(b, r, c, v, path, caps, out){
    let found=false;
    for(const [dr,dc] of dirsFor(v)){
      const mr=r+dr,mc=c+dc, lr=r+2*dr,lc=c+2*dc;
      if(inb(lr,lc) && b[lr][lc]===0 && side(b[mr]&&b[mr][mc])===-side(v) && b[mr][mc]!==0){
        const nb=clone(b); nb[r][c]=0; nb[mr][mc]=0; let nv=v;
        if(!king(v) && ((v>0&&lr===0)||(v<0&&lr===S-1))) nv=v*2; // corona
        nb[lr][lc]=nv;
        found=true; capSeq(nb, lr, lc, nv, [...path,[lr,lc]], [...caps,[mr,mc]], out);
      }
    }
    if(!found && path.length){ out.push({ path, caps }); }
  }
  function movesFor(b,s){ // genera y normaliza 'from' (captura obligatoria si existe)
    const out=[]; const caps=[];
    for(let r=0;r<S;r++)for(let c=0;c<S;c++){ const v=b[r][c]; if(side(v)!==s)continue; const tmp=[]; capSeq(b,r,c,v,[],[],tmp); tmp.forEach(m=>caps.push({from:[r,c],path:m.path,caps:m.caps})); }
    if(caps.length) return caps;
    for(let r=0;r<S;r++)for(let c=0;c<S;c++){ const v=b[r][c]; if(side(v)!==s)continue; for(const [dr,dc] of dirsFor(v)){ const nr=r+dr,nc=c+dc; if(inb(nr,nc)&&b[nr][nc]===0) out.push({from:[r,c],path:[[nr,nc]],caps:[]}); } }
    return out;
  }
  function applyMove(b, m){
    const nb=clone(b); let [r,c]=m.from; let v=nb[r][c]; nb[r][c]=0;
    m.caps.forEach(([cr,cc])=>nb[cr][cc]=0);
    const [er,ec]=m.path[m.path.length-1];
    if(!king(v) && ((v>0&&er===0)||(v<0&&er===S-1))) v=v*2;
    nb[er][ec]=v; return nb;
  }
  function evalB(b){ let s=0; for(let r=0;r<S;r++)for(let c=0;c<S;c++){ const v=b[r][c]; if(!v)continue; const val=king(v)?2.4:1; const adv=v>0?(S-1-r):r; s+= side(v)*(val + adv*0.04); } return s; } // + para jugador

  function minimax(b, s, depth, a, bta){
    const mv=movesFor(b,s);
    if(depth===0||!mv.length){ if(!mv.length) return s===1? -1000 : 1000; return evalB(b); }
    if(s===-1){ // IA minimiza (jugador positivo)
      let best=Infinity;
      for(const m of mv){ const val=minimax(applyMove(b,m),1,depth-1,a,bta); best=Math.min(best,val); bta=Math.min(bta,val); if(bta<=a)break; }
      return best;
    } else {
      let best=-Infinity;
      for(const m of mv){ const val=minimax(applyMove(b,m),-1,depth-1,a,bta); best=Math.max(best,val); a=Math.max(a,val); if(bta<=a)break; }
      return best;
    }
  }
  function aiMove(){
    const mv=movesFor(board,-1); if(!mv.length) return end("win");
    const depth=parseInt(cfg.depth);
    let best=mv[0], bestVal=Infinity;
    for(const m of mv){ const val=minimax(applyMove(board,m),1,depth-1,-Infinity,Infinity); if(val<bestVal){ bestVal=val; best=m; } }
    board=applyMove(board,best); if(best.caps.length) NovaAudio.play("eat"); else NovaAudio.play("move");
    updateHUD(); draw();
    if(!movesFor(board,1).length) return end("lose");
    turn=1; busy=false; turnEl.textContent="TÚ";
  }

  function updateHUD(){ let p=0,a=0; board.flat().forEach(v=>{ if(v>0)p++; else if(v<0)a++; }); pcEl.textContent=p; acEl.textContent=a; }
  function start(){ if(state==="play")return; if(state!=="play") init(); state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("neon",88); draw(); }
  function end(res){ state="over"; NovaAudio.stopMusic(); NovaAudio.play(res==="win"?"win":"over"); ovTitle.textContent= res==="win"?"¡GANASTE!":"PERDISTE"; ovTitle.className= res==="win"?"win":"lose"; ovMsg.textContent= res==="win"?"Capturaste o bloqueaste a la IA.":"La IA te bloqueó."; ovBtn.textContent="↻ Revancha"; ov.classList.add("show"); }

  function draw(){
    for(let r=0;r<S;r++)for(let c=0;c<S;c++){
      ctx.fillStyle = (r+c)%2===0 ? css("--surface-2") : css("--bg-2");
      ctx.fillRect(c*CELL,r*CELL,CELL,CELL);
    }
    // resaltar selección y destinos
    if(sel){ ctx.fillStyle=css("--accent"); ctx.globalAlpha=.25; ctx.fillRect(sel[1]*CELL,sel[0]*CELL,CELL,CELL); ctx.globalAlpha=1;
      legal.filter(m=>m.from[0]===sel[0]&&m.from[1]===sel[1]).forEach(m=>{ const [er,ec]=m.path[m.path.length-1]; ctx.fillStyle=css("--accent-3"); ctx.globalAlpha=.5; ctx.beginPath(); ctx.arc(ec*CELL+CELL/2,er*CELL+CELL/2,10,0,7); ctx.fill(); ctx.globalAlpha=1; }); }
    // fichas
    for(let r=0;r<S;r++)for(let c=0;c<S;c++){ const v=board[r][c]; if(!v)continue;
      const x=c*CELL+CELL/2,y=r*CELL+CELL/2;
      ctx.fillStyle = v>0? css("--accent") : css("--accent-2");
      if(cfg.glow){ ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=12; }
      ctx.beginPath(); ctx.arc(x,y,CELL/2-8,0,7); ctx.fill(); ctx.shadowBlur=0;
      ctx.strokeStyle="rgba(255,255,255,.25)"; ctx.lineWidth=2; ctx.stroke();
      if(king(v)){ ctx.fillStyle="#06060c"; ctx.font='700 20px "Chakra Petch"'; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("♛",x,y+1); }
    }
  }

  cv.addEventListener("click", e=>{
    if(state!=="play"||busy||turn!==1) return;
    const rect=cv.getBoundingClientRect(); const c=Math.floor((e.clientX-rect.left)/(rect.width/S)); const r=Math.floor((e.clientY-rect.top)/(rect.height/S));
    if(!inb(r,c)) return;
    legal = movesFor(board,1);
    const here = legal.filter(m=>m.from[0]===r&&m.from[1]===c);
    if(here.length){ sel=[r,c]; draw(); return; }
    if(sel){ const m=legal.find(mm=>mm.from[0]===sel[0]&&mm.from[1]===sel[1] && mm.path[mm.path.length-1][0]===r && mm.path[mm.path.length-1][1]===c);
      if(m){ board=applyMove(board,m); if(m.caps.length)NovaAudio.play("eat"); else NovaAudio.play("move"); sel=null; legal=[]; updateHUD(); draw();
        if(!movesFor(board,-1).length) return end("win");
        turn=-1; busy=true; turnEl.textContent="IA"; setTimeout(aiMove, 380); return; } }
    sel=null; draw();
  });

  ovBtn.onclick=()=>{ if(state==="over"){ init(); } start(); };
  document.getElementById("restart").onclick=()=>{ init(); state="idle"; ovTitle.textContent="DAMAS"; ovTitle.className=""; ovMsg.textContent="Captura obligatoria. Corona en el fondo."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({ gameId:"damas", onChange:(k)=>{ if(["depth","forced"].includes(k)){} draw(); }, extra:[
    { title:"Juego", rows:[
      { type:"select", key:"depth", label:"Dificultad IA", default:"3", options:[{value:"1",label:"Fácil"},{value:"3",label:"Normal"},{value:"5",label:"Difícil"}] },
    ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Mover", value:"Clic ficha → destino" } ]},
  ]});
  document.addEventListener("nova-theme-change", draw);
  init();
})();
