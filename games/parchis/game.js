/* Parchís (Ludo) — NOVA ARCADE. P0=rojo (humano) vs IA. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const turnEl = document.getElementById("turn"), dieEl = document.getElementById("die"), homeEl = document.getElementById("home");
  const G = 15, CELL = 34; // 15x15
  const PCOL = ["#ff3b3b","#3b9bff","#3bff7b","#ffd23b"]; // rojo, azul, verde, amarillo
  const NAME = ["Rojo (Tú)","Azul","Verde","Amarillo"];

  // pista principal 52 casillas (col,row) en grid 15x15
  const TRACK = [
    [6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],
    [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14]
  ];
  const START = [0,13,26,39];           // casilla de entrada por jugador
  const HOME = [                         // columnas de meta (5 casillas) hacia el centro
    [[7,13],[7,12],[7,11],[7,10],[7,9]],
    [[1,7],[2,7],[3,7],[4,7],[5,7]],
    [[7,1],[7,2],[7,3],[7,4],[7,5]],
    [[13,7],[12,7],[11,7],[10,7],[9,7]],
  ];
  const BASE = [ // 4 posiciones de aparcamiento por jugador (esquinas)
    [[1.5,11.5],[3.5,11.5],[1.5,13.5],[3.5,13.5]],
    [[1.5,1.5],[3.5,1.5],[1.5,3.5],[3.5,3.5]],
    [[11.5,1.5],[13.5,1.5],[11.5,3.5],[13.5,3.5]],
    [[11.5,11.5],[13.5,11.5],[11.5,13.5],[13.5,13.5]],
  ];
  const SAFE = new Set([0,8,13,21,26,34,39,47]); // entradas + estrellas

  let np, tok, turn, die, state="idle", busy=false, movable=[], rolled=false;
  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function setup(){ np=parseInt((NovaSettings.loadCfg("parchis").players)||"4"); tok=[]; for(let p=0;p<4;p++) tok.push([ -1,-1,-1,-1 ]); turn=0; die=0; rolled=false; movable=[]; state="play"; busy=false; updateHUD(); }
  // pos: -1 base; 0..50 pista relativa; 51..55 meta; 56 = en casa
  function absCell(p,pos){ return TRACK[(START[p]+pos)%52]; }
  function tokenCell(p,i){ const pos=tok[p][i]; if(pos<0) return null; if(pos<=50) return absCell(p,pos); if(pos<=55) return HOME[p][pos-51]; return [7,7]; }
  function updateHUD(){ turnEl.textContent = turn===0?"TÚ":NAME[turn]; dieEl.textContent= die||"–"; homeEl.textContent=`${tok[0].filter(v=>v===56).length}/4`; }

  function start(){ if(state==="play"&&tok)return; setup(); ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("neon",96); draw(); nextTurn(); }

  function legalMoves(p,d){
    const out=[];
    for(let i=0;i<4;i++){ const pos=tok[p][i];
      if(pos===56) continue;
      if(pos<0){ if(d===6) out.push(i); continue; } // salir solo con 6
      const np_=pos+d; if(np_<=56) out.push(i); // no pasarse de la meta
    }
    return out;
  }
  function nextTurn(){
    if(state!=="play") return; draw();
    if(turn===0){ busy=false; document.getElementById("roll").disabled=false; turnEl.textContent="TÚ"; return; }
    busy=true; document.getElementById("roll").disabled=true; turnEl.textContent=NAME[turn]; setTimeout(aiRoll,600);
  }
  function rollDie(){ return 1+((Math.random()*6)|0); }

  function humanRoll(){
    if(state!=="play"||turn!==0||busy||rolled) return;
    die=rollDie(); dieEl.textContent=die; NovaAudio.play("ui"); rolled=true;
    movable=legalMoves(0,die);
    if(!movable.length){ setTimeout(()=>endTurn(die===6), 700); }
    else { draw(); }
  }
  function aiRoll(){
    if(state!=="play")return; die=rollDie(); dieEl.textContent=die; NovaAudio.play("ui");
    const mv=legalMoves(turn,die);
    if(!mv.length){ setTimeout(()=>endTurn(die===6),500); return; }
    // heurística IA: priorizar capturar, luego salir de base, luego avanzar el más adelantado
    let best=mv[0], bestScore=-1;
    for(const i of mv){ let sc=0; const pos=tok[turn][i];
      const np_ = pos<0?0:pos+die; if(np_<=50){ const cell=absCell(turn,np_); if(!SAFE.has((START[turn]+np_)%52) && enemyOn(turn,cell)) sc+=100; }
      if(pos<0) sc+=20; if(np_===56) sc+=50; sc+=(pos<0?0:pos);
      if(sc>bestScore){ bestScore=sc; best=i; } }
    setTimeout(()=>{ doMove(turn,best); }, 500);
  }
  function enemyOn(p,cell){ if(!cell)return false; for(let q=0;q<4;q++){ if(q===p)continue; for(let i=0;i<4;i++){ const c=tokenCell(q,i); if(c&&c[0]===cell[0]&&c[1]===cell[1]) return true; } } return false; }

  function doMove(p,i){
    const pos=tok[p][i];
    if(pos<0){ tok[p][i]=0; NovaAudio.play("move"); }
    else { tok[p][i]=pos+die; NovaAudio.play("move"); }
    // captura
    const np_=tok[p][i];
    if(np_<=50){ const cell=absCell(p,np_); const absIdx=(START[p]+np_)%52;
      if(!SAFE.has(absIdx)){ for(let q=0;q<4;q++){ if(q===p)continue; for(let j=0;j<4;j++){ const c=tokenCell(q,j); if(c&&c[0]===cell[0]&&c[1]===cell[1]&&tok[q][j]<=50){ tok[q][j]=-1; NovaAudio.play("hit"); } } } }
    }
    if(np_===56) NovaAudio.play("point");
    updateHUD(); draw();
    if(tok[p].every(v=>v===56)) return win(p);
    endTurn(die===6);
  }
  function endTurn(extra){
    rolled=false; movable=[];
    if(extra && state==="play"){ // 6 = repite
      if(turn===0){ draw(); document.getElementById("roll").disabled=false; return; }
      else { setTimeout(aiRoll,500); return; }
    }
    turn=(turn+1)%np; updateHUD(); nextTurn();
  }
  function win(p){ state="over"; NovaAudio.stopMusic(); NovaAudio.play(p===0?"win":"over"); ovTitle.textContent=p===0?"¡GANASTE!":"FIN"; ovTitle.className=p===0?"win":"lose"; ovMsg.textContent=`Ganó ${NAME[p]}.`; ovBtn.textContent="↻ Nueva"; ov.classList.add("show"); }

  // ── render ──
  function cx(gx){ return gx*CELL+CELL/2; }
  function draw(){
    ctx.fillStyle=css("--bg-2"); ctx.fillRect(0,0,cv.width,cv.height);
    // casas (esquinas) coloreadas
    const corners=[[0,9],[0,0],[9,0],[9,9]];
    corners.forEach((c,p)=>{ ctx.fillStyle=PCOL[p]; ctx.globalAlpha=.18; ctx.fillRect(c[0]*CELL,c[1]*CELL,6*CELL,6*CELL); ctx.globalAlpha=1; ctx.strokeStyle=PCOL[p]; ctx.lineWidth=2; ctx.strokeRect(c[0]*CELL,c[1]*CELL,6*CELL,6*CELL); });
    // pista
    TRACK.forEach((cell,idx)=>{ ctx.fillStyle=css("--surface-2"); ctx.strokeStyle=css("--border"); ctx.lineWidth=1; ctx.fillRect(cell[0]*CELL,cell[1]*CELL,CELL,CELL); ctx.strokeRect(cell[0]*CELL,cell[1]*CELL,CELL,CELL);
      if(SAFE.has(idx)){ ctx.fillStyle=css("--accent-3"); ctx.globalAlpha=.25; ctx.fillRect(cell[0]*CELL,cell[1]*CELL,CELL,CELL); ctx.globalAlpha=1; } });
    // entradas coloreadas
    START.forEach((s,p)=>{ const cell=TRACK[s]; ctx.fillStyle=PCOL[p]; ctx.globalAlpha=.5; ctx.fillRect(cell[0]*CELL,cell[1]*CELL,CELL,CELL); ctx.globalAlpha=1; });
    // columnas meta
    HOME.forEach((col,p)=>{ col.forEach(cell=>{ ctx.fillStyle=PCOL[p]; ctx.globalAlpha=.35; ctx.fillRect(cell[0]*CELL,cell[1]*CELL,CELL,CELL); ctx.globalAlpha=1; ctx.strokeStyle=css("--border"); ctx.strokeRect(cell[0]*CELL,cell[1]*CELL,CELL,CELL); }); });
    // centro
    ctx.fillStyle=css("--surface-solid"); ctx.beginPath(); ctx.moveTo(cx(6.5)-CELL,cx(6.5)); ctx.lineTo(cx(7.5)+CELL,cx(7.5)); ctx.fill();
    ctx.fillStyle=css("--accent"); ctx.font='700 16px "Bungee"'; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("★", cx(7), cx(7));
    // fichas
    for(let p=0;p<np;p++) for(let i=0;i<4;i++){ let cell; const pos=tok[p][i];
      cell = pos<0 ? BASE[p][i] : tokenCell(p,i);
      if(!cell) continue;
      const x=cell[0]*CELL+CELL/2, y=cell[1]*CELL+CELL/2;
      const hot = (turn===0&&p===0&&rolled&&movable.includes(i));
      ctx.fillStyle=PCOL[p]; if(hot&&true){ ctx.shadowColor=css("--accent"); ctx.shadowBlur=14; }
      ctx.beginPath(); ctx.arc(x,y,CELL/2-6,0,7); ctx.fill(); ctx.shadowBlur=0;
      ctx.strokeStyle= hot?css("--accent"):"rgba(255,255,255,.5)"; ctx.lineWidth=hot?3:1.5; ctx.stroke();
    }
  }

  cv.addEventListener("click", e=>{
    if(state!=="play"||turn!==0||!rolled||busy) return;
    const rect=cv.getBoundingClientRect(); const gx=Math.floor((e.clientX-rect.left)/(rect.width/G)), gy=Math.floor((e.clientY-rect.top)/(rect.height/G));
    for(const i of movable){ const pos=tok[0][i]; const cell = pos<0?BASE[0][i].map(Math.floor):tokenCell(0,i); if(cell && Math.floor(cell[0])===gx && Math.floor(cell[1])===gy){ doMove(0,i); return; } }
  });

  ovBtn.onclick=()=>{ start(); };
  document.getElementById("roll").onclick=humanRoll;
  document.getElementById("restart").onclick=()=>{ state="idle"; tok=null; ovTitle.textContent="PARCHÍS"; ovTitle.className=""; ovMsg.textContent="Tú (rojo) vs IA. Saca 6 para salir."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({ gameId:"parchis", onChange:(k)=>{ if(tok)draw(); }, extra:[
    { title:"Juego", rows:[ { type:"select", key:"players", label:"Jugadores", default:"4", options:[{value:"2",label:"2"},{value:"3",label:"3"},{value:"4",label:"4"}] } ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Tirar", value:"Botón / barra" }, { type:"keys", label:"Mover ficha", value:"Clic en ficha resaltada" } ]},
  ]});
  document.addEventListener("nova-theme-change", ()=>{ if(tok)draw(); });
})();
