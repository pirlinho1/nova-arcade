/* Ajedrez — NOVA ARCADE. Jugador=blancas (abajo), IA=negras. Motor legal completo + minimax. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const turnEl = document.getElementById("turn"), statusEl = document.getElementById("status");
  const N = 8, CELL = 64;
  const GLYPH = { K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙", k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟" };
  const VAL = { p:100,n:320,b:330,r:500,q:900,k:20000 };

  let cfg = Object.assign({ depth: "2", flip: false, glow: true, hints: true }, NovaSettings.loadCfg("chess"));
  let B, turn, castle, ep, sel, legalCache, state = "idle", busy = false, history = [];

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  const isW = p => p && p === p.toUpperCase();
  const isB = p => p && p === p.toLowerCase();
  const colorOf = p => !p ? null : (isW(p) ? "w" : "b");
  const inb = (r,c) => r>=0&&r<8&&c>=0&&c<8;

  function initBoard(){
    B = [
      "rnbqkbnr".split(""), "pppppppp".split(""),
      Array(8).fill(""), Array(8).fill(""), Array(8).fill(""), Array(8).fill(""),
      "PPPPPPPP".split(""), "RNBQKBNR".split("")
    ];
    turn="w"; castle={wK:true,wQ:true,bK:true,bQ:true}; ep=null; sel=null; legalCache=null; history=[];
  }
  function cloneState(){ return { B:B.map(r=>r.slice()), turn, castle:{...castle}, ep:ep?[...ep]:null }; }
  function restore(s){ B=s.B.map(r=>r.slice()); turn=s.turn; castle={...s.castle}; ep=s.ep?[...s.ep]:null; }

  // ── ataques ──
  function attacked(board, r, c, by){ // ¿la casilla (r,c) está atacada por color 'by'?
    const dir = by==="w" ? -1 : 1; // peones de 'by' atacan hacia... blanco sube (r decrece)
    // peones
    for(const dc of [-1,1]){ const pr=r-dir, pc=c+dc; if(inb(pr,pc)){ const p=board[pr][pc]; if(p && colorOf(p)===by && p.toLowerCase()==="p") return true; } }
    // caballos
    for(const [dr,dc] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){ const nr=r+dr,nc=c+dc; if(inb(nr,nc)){ const p=board[nr][nc]; if(p&&colorOf(p)===by&&p.toLowerCase()==="n") return true; } }
    // rey
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){ if(!dr&&!dc)continue; const nr=r+dr,nc=c+dc; if(inb(nr,nc)){ const p=board[nr][nc]; if(p&&colorOf(p)===by&&p.toLowerCase()==="k") return true; } }
    // deslizantes
    const slides=[[[1,0],[-1,0],[0,1],[0,-1],"rq"],[[1,1],[1,-1],[-1,1],[-1,-1],"bq"]];
    for(const grp of slides){ const types=grp[4]; for(let i=0;i<4;i++){ const [dr,dc]=grp[i]; let nr=r+dr,nc=c+dc; while(inb(nr,nc)){ const p=board[nr][nc]; if(p){ if(colorOf(p)===by && types.includes(p.toLowerCase())) return true; break; } nr+=dr;nc+=dc; } } }
    return false;
  }
  function kingPos(board, color){ const k = color==="w"?"K":"k"; for(let r=0;r<8;r++)for(let c=0;c<8;c++) if(board[r][c]===k) return [r,c]; return null; }
  function inCheck(board, color){ const kp=kingPos(board,color); return kp ? attacked(board, kp[0], kp[1], color==="w"?"b":"w") : false; }

  // ── generación pseudo-legal ──
  function pseudo(color){
    const mv=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){ const p=B[r][c]; if(!p||colorOf(p)!==color) continue;
      const t=p.toLowerCase();
      if(t==="p"){
        const dir = color==="w"?-1:1, start = color==="w"?6:1, promoRow = color==="w"?0:7;
        if(inb(r+dir,c)&&!B[r+dir][c]){ addPawn(mv,r,c,r+dir,c,promoRow); if(r===start&&!B[r+2*dir][c]) mv.push({from:[r,c],to:[r+2*dir,c],dbl:true}); }
        for(const dc of [-1,1]){ const nr=r+dir,nc=c+dc; if(!inb(nr,nc))continue;
          if(B[nr][nc]&&colorOf(B[nr][nc])!==color) addPawn(mv,r,c,nr,nc,promoRow);
          else if(ep&&ep[0]===nr&&ep[1]===nc) mv.push({from:[r,c],to:[nr,nc],ep:true});
        }
      } else if(t==="n"){ for(const [dr,dc] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){ const nr=r+dr,nc=c+dc; if(inb(nr,nc)&&colorOf(B[nr][nc])!==color) mv.push({from:[r,c],to:[nr,nc]}); } }
      else if(t==="k"){ for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){ if(!dr&&!dc)continue; const nr=r+dr,nc=c+dc; if(inb(nr,nc)&&colorOf(B[nr][nc])!==color) mv.push({from:[r,c],to:[nr,nc]}); }
        // enroque
        const row = color==="w"?7:0;
        if(r===row&&c===4&&!inCheck(B,color)){
          if(castle[color+"K"]&&!B[row][5]&&!B[row][6]&&!attacked(B,row,5,opp(color))&&!attacked(B,row,6,opp(color))) mv.push({from:[r,c],to:[row,6],castle:"K"});
          if(castle[color+"Q"]&&!B[row][3]&&!B[row][2]&&!B[row][1]&&!attacked(B,row,3,opp(color))&&!attacked(B,row,2,opp(color))) mv.push({from:[r,c],to:[row,2],castle:"Q"});
        }
      } else { // deslizantes
        const dirs = t==="r"?[[1,0],[-1,0],[0,1],[0,-1]] : t==="b"?[[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for(const [dr,dc] of dirs){ let nr=r+dr,nc=c+dc; while(inb(nr,nc)){ const q=B[nr][nc]; if(!q) mv.push({from:[r,c],to:[nr,nc]}); else { if(colorOf(q)!==color) mv.push({from:[r,c],to:[nr,nc]}); break; } nr+=dr;nc+=dc; } }
      }
    }
    return mv;
  }
  function opp(c){ return c==="w"?"b":"w"; }
  function addPawn(mv,r,c,nr,nc,promoRow){ if(nr===promoRow){ for(const pr of ["q","r","b","n"]) mv.push({from:[r,c],to:[nr,nc],promo:pr}); } else mv.push({from:[r,c],to:[nr,nc]}); }

  function applyMove(m){ // muta B/castle/ep/turn. Devuelve color que movió.
    const [fr,fc]=m.from, [tr,tc]=m.to; let p=B[fr][fc]; const color=colorOf(p);
    ep = m.dbl ? [(fr+tr)/2, fc] : null;
    if(m.ep){ B[fr][tc]=""; } // captura al paso
    B[fr][fc]="";
    if(m.promo){ p = color==="w"?m.promo.toUpperCase():m.promo; }
    B[tr][tc]=p;
    if(m.castle){ const row=fr; if(m.castle==="K"){ B[row][5]=B[row][7]; B[row][7]=""; } else { B[row][3]=B[row][0]; B[row][0]=""; } }
    // derechos de enroque
    if(p.toLowerCase()==="k"){ castle[color+"K"]=false; castle[color+"Q"]=false; }
    if(fr===7&&fc===0||tr===7&&tc===0) castle.wQ=false;
    if(fr===7&&fc===7||tr===7&&tc===7) castle.wK=false;
    if(fr===0&&fc===0||tr===0&&tc===0) castle.bQ=false;
    if(fr===0&&fc===7||tr===0&&tc===7) castle.bK=false;
    turn=opp(color); return color;
  }
  function legalMoves(color){
    const out=[];
    for(const m of pseudo(color)){ const s=cloneState(); applyMove(m); const bad=inCheck(B,color); restore(s); if(!bad) out.push(m); }
    return out;
  }

  // ── IA ──
  function evalBoard(){ let s=0; for(let r=0;r<8;r++)for(let c=0;c<8;c++){ const p=B[r][c]; if(!p)continue; const v=VAL[p.toLowerCase()]; const center = (3.5-Math.abs(3.5-r))+(3.5-Math.abs(3.5-c)); s += (isW(p)?1:-1)*(v + center*2); } return s; } // + favorece blancas
  function search(depth, a, b, color){
    if(depth===0) return evalBoard();
    const moves=legalMoves(color);
    if(!moves.length){ return inCheck(B,color) ? (color==="w"? -1e6-depth : 1e6+depth) : 0; }
    if(color==="w"){ let best=-Infinity; for(const m of moves){ const s=cloneState(); applyMove(m); best=Math.max(best,search(depth-1,a,b,"b")); restore(s); a=Math.max(a,best); if(b<=a)break; } return best; }
    else { let best=Infinity; for(const m of moves){ const s=cloneState(); applyMove(m); best=Math.min(best,search(depth-1,a,b,"w")); restore(s); b=Math.min(b,best); if(b<=a)break; } return best; }
  }
  function aiMove(){
    const moves=legalMoves("b"); if(!moves.length) return finishCheck("b");
    const depth=parseInt(cfg.depth); let best=moves[0], bestV=Infinity;
    // pequeña aleatoriedad entre empates para variar partidas
    for(const m of moves){ const s=cloneState(); applyMove(m); const v=search(depth-1,-Infinity,Infinity,"w")+(Math.random()*6-3); restore(s); if(v<bestV){ bestV=v; best=m; } }
    const cap = !!B[best.to[0]][best.to[1]] || best.ep;
    applyMove(best); NovaAudio.play(cap?"eat":"move");
    busy=false; afterMove();
  }

  function afterMove(){
    turnEl.textContent = turn==="w"?"BLANCAS":"NEGRAS";
    const lm=legalMoves(turn);
    if(!lm.length){ return finishCheck(turn); }
    statusEl.textContent = inCheck(B,turn) ? "JAQUE" : "—";
    draw();
    if(turn==="b" && state==="play"){ busy=true; setTimeout(aiMove, 250); }
  }
  function finishCheck(color){
    draw();
    if(inCheck(B,color)){ const winner = color==="w"?"NEGRAS (IA)":"BLANCAS (TÚ)"; end(color==="w"?"lose":"win", `Jaque mate · ganan ${winner}`); }
    else end("draw","Tablas (ahogado)");
  }
  function end(res,msg){ state="over"; NovaAudio.stopMusic(); NovaAudio.play(res==="win"?"win":res==="lose"?"over":"point");
    ovTitle.textContent = res==="win"?"¡GANASTE!":res==="lose"?"JAQUE MATE":"TABLAS"; ovTitle.className = res==="win"?"win":res==="lose"?"lose":"";
    ovMsg.textContent=msg; ovBtn.textContent="↻ Revancha"; ov.classList.add("show"); }

  function start(){ if(state==="play")return; if(state!=="play") initBoard(); state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("neon",84); turnEl.textContent="BLANCAS"; statusEl.textContent="—"; draw(); }

  // ── render ──
  function sq(r,c){ return cfg.flip ? [7-r,7-c] : [r,c]; }
  function draw(){
    const light=css("--surface-2"), dark=css("--bg-2");
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){ const [vr,vc]=sq(r,c); ctx.fillStyle=(r+c)%2===0?light:dark; ctx.fillRect(vc*CELL,vr*CELL,CELL,CELL); }
    // resaltados
    if(sel){ const lm=(legalCache||[]).filter(m=>m.from[0]===sel[0]&&m.from[1]===sel[1]);
      const [svr,svc]=sq(sel[0],sel[1]); ctx.fillStyle=css("--accent"); ctx.globalAlpha=.3; ctx.fillRect(svc*CELL,svr*CELL,CELL,CELL); ctx.globalAlpha=1;
      if(cfg.hints) lm.forEach(m=>{ const [vr,vc]=sq(m.to[0],m.to[1]); ctx.fillStyle=css("--accent-3"); ctx.globalAlpha=.55; ctx.beginPath(); ctx.arc(vc*CELL+CELL/2,vr*CELL+CELL/2, B[m.to[0]][m.to[1]]?CELL/2-4:11, 0, 7); ctx.globalAlpha = B[m.to[0]][m.to[1]]?0.35:0.55; ctx.fill(); ctx.globalAlpha=1; });
    }
    // jaque: marca rey
    if(state==="play"){ const kp=kingPos(B,turn); if(kp&&inCheck(B,turn)){ const [vr,vc]=sq(kp[0],kp[1]); ctx.fillStyle=css("--accent-2"); ctx.globalAlpha=.4; ctx.fillRect(vc*CELL,vr*CELL,CELL,CELL); ctx.globalAlpha=1; } }
    // piezas
    ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font=`${CELL-14}px serif`;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){ const p=B[r][c]; if(!p)continue; const [vr,vc]=sq(r,c);
      ctx.fillStyle = isW(p)? "#f5f5fa" : "#10101e";
      if(cfg.glow){ ctx.shadowColor = isW(p)?css("--accent"):css("--accent-2"); ctx.shadowBlur=isW(p)?6:4; }
      ctx.fillText(GLYPH[p], vc*CELL+CELL/2, vr*CELL+CELL/2+2); ctx.shadowBlur=0;
    }
  }

  cv.addEventListener("click", e=>{
    if(state!=="play"||busy||turn!=="w") return;
    const rect=cv.getBoundingClientRect(); let c=Math.floor((e.clientX-rect.left)/(rect.width/8)), r=Math.floor((e.clientY-rect.top)/(rect.height/8));
    if(cfg.flip){ r=7-r; c=7-c; }
    if(!inb(r,c)) return;
    legalCache = legalMoves("w");
    const own = B[r][c] && colorOf(B[r][c])==="w";
    if(own){ sel=[r,c]; draw(); return; }
    if(sel){ const m = legalCache.find(mm=>mm.from[0]===sel[0]&&mm.from[1]===sel[1]&&mm.to[0]===r&&mm.to[1]===c && (!mm.promo||mm.promo==="q"));
      if(m){ history.push(cloneState()); const cap=!!B[r][c]||m.ep; applyMove(m); NovaAudio.play(cap?"eat":"move"); sel=null; legalCache=null; afterMove(); return; } }
    sel=null; draw();
  });

  ovBtn.onclick=()=>{ if(state==="over"){ initBoard(); } start(); };
  document.getElementById("restart").onclick=()=>{ initBoard(); state="idle"; ovTitle.textContent="AJEDREZ"; ovTitle.className=""; ovMsg.textContent="Juegas con blancas contra la IA."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); };
  document.getElementById("undo").onclick=()=>{ if(state==="play"&&!busy&&history.length){ restore(history.pop()); turn="w"; sel=null; legalCache=null; busy=false; afterMove(); } };

  NovaSettings.mount({ gameId:"chess", onChange:(k)=>{ draw(); }, extra:[
    { title:"Juego", rows:[
      { type:"select", key:"depth", label:"Dificultad IA", default:"2", options:[{value:"1",label:"Fácil"},{value:"2",label:"Normal"},{value:"3",label:"Difícil"}] },
      { type:"toggle", key:"flip", label:"Tablero girado", default:false },
      { type:"toggle", key:"hints", label:"Mostrar movimientos", default:true },
    ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Mover", value:"Clic pieza → destino" }, { type:"keys", label:"Coronación", value:"automática a dama" } ]},
  ]});
  document.addEventListener("nova-theme-change", draw);
  initBoard(); draw();
})();
