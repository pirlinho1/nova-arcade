/* Solitario (Klondike) — NOVA ARCADE */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const movesEl = document.getElementById("moves"), foundEl = document.getElementById("found"), timeEl = document.getElementById("time");
  const SUITS = ["♠","♥","♦","♣"], RED = new Set(["♥","♦"]);
  const CW = 84, CH = 116, GAP = 14, FAN = 26;

  let cfg = Object.assign({ draw: "1", glow: true }, NovaSettings.loadCfg("solitaire"));
  let stock, waste, found, tableau, sel, moves, state="idle", t0, timer;

  function color(c){ return RED.has(c.s) ? "r" : "b"; }
  function label(c){ return ({1:"A",11:"J",12:"Q",13:"K"}[c.r] || c.r) + c.s; }

  function deal(){
    const deck=[]; for(const s of SUITS) for(let r=1;r<=13;r++) deck.push({r,s,up:false});
    for(let i=deck.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [deck[i],deck[j]]=[deck[j],deck[i]]; }
    tableau=[[],[],[],[],[],[],[]]; found=[[],[],[],[]]; waste=[];
    for(let col=0;col<7;col++) for(let n=0;n<=col;n++){ const card=deck.pop(); card.up=(n===col); tableau[col].push(card); }
    stock=deck; stock.forEach(c=>c.up=false);
    sel=null; moves=0; updateHUD();
  }
  function updateHUD(){ movesEl.textContent=moves; const f=found.reduce((a,p)=>a+p.length,0); foundEl.textContent=f+"/52"; }

  function start(){ if(state==="play")return; if(state!=="play") deal(); state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("neon",92); t0=Date.now(); clearInterval(timer); timer=setInterval(tick,500); draw(); }
  function tick(){ const s=((Date.now()-t0)/1000)|0; timeEl.textContent=`${(s/60)|0}:${String(s%60).padStart(2,"0")}`; }

  // ── geometría de zonas ──
  const X0=GAP, Y0=GAP, TABY=Y0+CH+GAP;
  function stockRect(){ return [X0,Y0,CW,CH]; }
  function wasteRect(){ return [X0+CW+GAP,Y0,CW,CH]; }
  function foundRect(i){ return [X0+(3+i)*(CW+GAP),Y0,CW,CH]; }
  function tabX(col){ return X0+col*(CW+GAP); }

  function hit(x,y){
    // stock
    if(within(x,y,stockRect())) return {zone:"stock"};
    if(within(x,y,wasteRect())) return {zone:"waste"};
    for(let i=0;i<4;i++) if(within(x,y,foundRect(i))) return {zone:"found",i};
    for(let col=0;col<7;col++){ const pile=tableau[col]; const bx=tabX(col);
      if(x>=bx&&x<bx+CW){ // dentro de la columna
        if(!pile.length){ if(y>=TABY&&y<TABY+CH) return {zone:"tab",col,idx:-1}; continue; }
        for(let n=pile.length-1;n>=0;n--){ const cy=TABY+n*FAN; const h=(n===pile.length-1)?CH:FAN; if(y>=cy&&y<cy+h){ return {zone:"tab",col,idx:n}; } }
      }
    }
    return null;
  }
  function within(x,y,[rx,ry,rw,rh]){ return x>=rx&&x<rx+rw&&y>=ry&&y<ry+rh; }

  function canFound(card, i){ const f=found[i]; if(!f.length) return card.r===1; const top=f[f.length-1]; return top.s===card.s && card.r===top.r+1; }
  function canTab(card, col){ const p=tableau[col]; if(!p.length) return card.r===13; const top=p[p.length-1]; return top.up && color(top)!==color(card) && top.r===card.r+1; }

  function drawStock(){
    if(!stock.length){ // reciclar waste -> stock
      if(!waste.length) return; stock=waste.reverse().map(c=>({...c,up:false})); waste=[]; bump(); return;
    }
    const n=cfg.draw==="3"?3:1;
    for(let k=0;k<n&&stock.length;k++){ const c=stock.pop(); c.up=true; waste.push(c); }
    NovaAudio.play("move"); bump();
  }
  function bump(){ moves++; updateHUD(); sel=null; draw(); checkWin(); }

  function trySelectThenMove(h){
    if(!h){ sel=null; draw(); return; }
    if(h.zone==="stock"){ drawStock(); return; }
    // si no hay selección, seleccionar origen válido
    if(!sel){
      if(h.zone==="waste" && waste.length) sel={zone:"waste"};
      else if(h.zone==="found" && found[h.i].length) sel={zone:"found",i:h.i};
      else if(h.zone==="tab" && h.idx>=0 && tableau[h.col][h.idx].up) sel={zone:"tab",col:h.col,idx:h.idx};
      else return;
      NovaAudio.play("ui"); draw(); return;
    }
    // ya hay selección: intentar mover al destino h
    const moved = doMove(sel, h);
    sel=null; draw(); if(moved){ NovaAudio.play(moved==="found"?"point":"move"); flipExposed(); bump_noSelClear(); }
  }
  function bump_noSelClear(){ moves++; updateHUD(); checkWin(); }

  function pickCards(src){ // devuelve [cartas...] que se mueven desde src
    if(src.zone==="waste") return waste.length?[waste[waste.length-1]]:[];
    if(src.zone==="found") return found[src.i].length?[found[src.i][found[src.i].length-1]]:[];
    if(src.zone==="tab") return tableau[src.col].slice(src.idx);
    return [];
  }
  function removeCards(src,n){
    if(src.zone==="waste") return [waste.pop()];
    if(src.zone==="found") return [found[src.i].pop()];
    if(src.zone==="tab") return tableau[src.col].splice(src.idx);
  }
  function doMove(src,dst){
    const cards=pickCards(src); if(!cards.length) return false;
    if(dst.zone==="found"){ if(cards.length!==1) return false; if(!canFound(cards[0],dst.i)) return false; removeCards(src); found[dst.i].push(cards[0]); return "found"; }
    if(dst.zone==="tab"){ if(!canTab(cards[0],dst.col)) return false; const moved=removeCards(src); tableau[dst.col].push(...moved); return "tab"; }
    return false;
  }
  function flipExposed(){ for(const p of tableau){ if(p.length && !p[p.length-1].up){ p[p.length-1].up=true; } } }

  function autoFoundation(){
    let any=false, did=true;
    while(did){ did=false;
      // waste
      if(waste.length){ const c=waste[waste.length-1]; for(let i=0;i<4;i++) if(canFound(c,i)){ found[i].push(waste.pop()); did=any=true; break; } }
      // tableau tops
      for(let col=0;col<7&&!did;col++){ const p=tableau[col]; if(p.length&&p[p.length-1].up){ const c=p[p.length-1]; for(let i=0;i<4;i++) if(canFound(c,i)){ found[i].push(p.pop()); flipExposed(); did=any=true; break; } } }
    }
    if(any){ moves++; updateHUD(); NovaAudio.play("point"); draw(); checkWin(); }
  }
  function checkWin(){ if(found.reduce((a,p)=>a+p.length,0)===52){ state="over"; clearInterval(timer); NovaAudio.stopMusic(); NovaAudio.play("win"); ovTitle.textContent="¡GANASTE!"; ovTitle.className="win"; ovMsg.textContent=`${moves} movimientos · ${timeEl.textContent}`; ovBtn.textContent="↻ Nuevo"; ov.classList.add("show"); } }

  // ── render ──
  function roundedCard(x,y,w,h,fill,stroke){ ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=1.5; ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.fill(); ctx.stroke(); }
  function drawCard(card,x,y,seld){
    if(!card.up){ roundedCard(x,y,CW,CH,css("--surface-2"),css("--border")); ctx.fillStyle=css("--accent"); ctx.globalAlpha=.4; ctx.beginPath(); ctx.roundRect(x+8,y+8,CW-16,CH-16,6); ctx.fill(); ctx.globalAlpha=1; return; }
    roundedCard(x,y,CW,CH,css("--surface-solid"), seld?css("--accent"):css("--border"));
    if(seld&&cfg.glow){ ctx.shadowColor=css("--accent"); ctx.shadowBlur=12; ctx.strokeStyle=css("--accent"); ctx.lineWidth=2.5; ctx.beginPath(); ctx.roundRect(x,y,CW,CH,8); ctx.stroke(); ctx.shadowBlur=0; }
    ctx.fillStyle = RED.has(card.s)?css("--accent-2"):css("--text");
    ctx.textAlign="left"; ctx.textBaseline="top"; ctx.font='700 18px "Chakra Petch"';
    ctx.fillText(label(card), x+8, y+8);
    ctx.textAlign="center"; ctx.font="34px serif"; ctx.fillText(card.s, x+CW/2, y+CH/2-10);
  }
  function emptySlot(x,y,glyph){ ctx.strokeStyle=css("--border"); ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.beginPath(); ctx.roundRect(x,y,CW,CH,8); ctx.stroke(); ctx.setLineDash([]); if(glyph){ ctx.fillStyle=css("--text-dim"); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font="30px serif"; ctx.fillText(glyph,x+CW/2,y+CH/2); } }
  let _cssCache={}; function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function draw(){
    ctx.fillStyle=css("--bg-2"); ctx.fillRect(0,0,cv.width,cv.height);
    // stock
    if(stock.length) drawCard({up:false},...stockRect().slice(0,2)); else emptySlot(...stockRect().slice(0,2),"↺");
    // waste (top)
    if(waste.length) drawCard(waste[waste.length-1],...wasteRect().slice(0,2), sel&&sel.zone==="waste"); else emptySlot(...wasteRect().slice(0,2));
    // foundations
    for(let i=0;i<4;i++){ const [x,y]=foundRect(i); if(found[i].length) drawCard(found[i][found[i].length-1],x,y, sel&&sel.zone==="found"&&sel.i===i); else emptySlot(x,y,SUITS[i]); }
    // tableau
    for(let col=0;col<7;col++){ const p=tableau[col], x=tabX(col); if(!p.length){ emptySlot(x,TABY,"K"); continue; }
      p.forEach((card,n)=>{ const seld = sel&&sel.zone==="tab"&&sel.col===col&&n>=sel.idx; drawCard(card,x,TABY+n*FAN,seld); });
    }
  }

  cv.addEventListener("click", e=>{
    if(state!=="play") return;
    const rect=cv.getBoundingClientRect(); const x=(e.clientX-rect.left)*(cv.width/rect.width), y=(e.clientY-rect.top)*(cv.height/rect.height);
    trySelectThenMove(hit(x,y));
  });
  ovBtn.onclick=()=>{ if(state==="over"){ deal(); } start(); };
  document.getElementById("auto").onclick=()=>{ if(state==="play") autoFoundation(); };
  document.getElementById("restart").onclick=()=>{ clearInterval(timer); deal(); state="idle"; ovTitle.textContent="SOLITARIO"; ovTitle.className=""; ovMsg.textContent="Klondike. Roba del mazo y ordena por palo."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); draw(); };

  NovaSettings.mount({ gameId:"solitaire", onChange:()=>draw(), extra:[
    { title:"Juego", rows:[ { type:"select", key:"draw", label:"Robar", default:"1", options:[{value:"1",label:"1 carta"},{value:"3",label:"3 cartas"}] } ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Robar", value:"Clic en el mazo" }, { type:"keys", label:"Mover", value:"Clic carta → destino" } ]},
  ]});
  document.addEventListener("nova-theme-change", draw);
  deal(); draw();
})();
