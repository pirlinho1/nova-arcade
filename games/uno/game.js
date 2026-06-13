/* UNO — NOVA ARCADE. Humano (0) vs IA. Versión gráfica con animaciones y ritmo legible. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const msgEl = document.getElementById("msg"), picker = document.getElementById("colorpick");
  const COLORS = { r:"#ff3b3b", y:"#ffd23b", g:"#3bff7b", b:"#3b9bff", w:"#2a2a44" };
  const DARK = { r:"#b81f1f", y:"#b8901f", g:"#1fa84d", b:"#1f5fb8", w:"#15152a" };
  const W=cv.width, H=cv.height, CW=58, CH=86;
  let cfg = Object.assign({ players:"4", speed:"normal", glow:true }, NovaSettings.loadCfg("uno"));
  const PACE = { rapido:450, normal:850, lento:1300 };
  let hands, draw, discard, curColor, curVal, dir, turn, np, state="idle", busy=false, pendingWild=null, handRects=[];
  let anims=[], unoCall={p:-1,t:0}, colorFlash=0, raf=null;

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function buildDeck(){ const d=[]; for(const c of ["r","y","g","b"]){ d.push({c,v:"0"}); for(let n=1;n<=9;n++){ d.push({c,v:String(n)}); d.push({c,v:String(n)}); } for(const a of ["skip","rev","+2"]){ d.push({c,v:a}); d.push({c,v:a}); } } for(let i=0;i<4;i++){ d.push({c:"w",v:"wild"}); d.push({c:"w",v:"+4"}); } for(let i=d.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [d[i],d[j]]=[d[j],d[i]]; } return d; }
  function setup(){ np=parseInt(cfg.players); draw=buildDeck(); hands=Array.from({length:np},()=>draw.splice(0,7)); let first; do{ first=draw.shift(); }while(first.c==="w"); discard=[first]; curColor=first.c; curVal=first.v; dir=1; turn=0; anims=[]; busy=false; if(first.v==="rev")dir=-1; if(first.v==="skip")turn=next(turn); if(first.v==="+2"){drawN(0,2);turn=next(turn);} }
  function next(t,s=1){ return ((t+dir*s)%np+np)%np; }
  function reshuffle(){ if(draw.length)return; const top=discard.pop(); draw=discard; discard=[top]; for(let i=draw.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [draw[i],draw[j]]=[draw[j],draw[i]]; } draw.forEach(c=>{ if(c.c==="w")c.chosen=null; }); }
  function drawN(p,n){ for(let k=0;k<n;k++){ reshuffle(); if(draw.length) hands[p].push(draw.shift()); } }
  function playable(card){ return card.c==="w"||card.c===curColor||card.v===curVal; }

  // ── posiciones (para animaciones) ──
  const DISCARD={x:W/2-CW/2, y:H/2-CH/2-10}, DRAW={x:W/2-CW-14, y:H/2-CH/2-10};
  function seatPos(p){ // centro aproximado de la mano de cada jugador
    if(p===0) return {x:W/2, y:H-CH/2-12};
    const map={ 1:{x:40,y:H/2}, 2:{x:W/2,y:46}, 3:{x:W-40,y:H/2} };
    return map[p]||{x:W/2,y:46};
  }
  function oppSeats(){ return ({2:[2],3:[1,2],4:[2,1,3]})[np]||[2]; }

  function start(){ if(state==="play"&&hands)return; setup(); state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("chip",100); loop(); turnLoop(); }

  function turnLoop(){
    if(state!=="play"||anims.length) return;
    if(turn===0){ msg("Tu turno — juega una carta válida (resaltada) o roba."); busy=false; return; }
    busy=true; msg(`Pensando: IA ${turn}…`);
    setTimeout(aiTurn, PACE[cfg.speed]);
  }
  function aiTurn(){
    if(state!=="play")return; const hand=hands[turn];
    let opts=hand.map((c,i)=>({c,i})).filter(o=>playable(o.c));
    if(opts.length){ opts.sort((a,b)=>scoreCard(b.c)-scoreCard(a.c)); const pick=opts[0]; let chosen=null;
      if(pick.c.c==="w"){ const cnt={r:0,y:0,g:0,b:0}; hand.forEach(c=>{ if(cnt[c.c]!=null)cnt[c.c]++; }); chosen=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]; }
      animatePlay(turn, pick.i, chosen);
    } else { animateDraw(turn, 1, ()=>{ const c=hands[turn][hands[turn].length-1]; if(playable(c)){ const chosen=c.c==="w"?["r","y","g","b"][(Math.random()*4)|0]:null; setTimeout(()=>animatePlay(turn, hands[turn].length-1, chosen), PACE[cfg.speed]*0.5); } else { msg(`IA ${turn} robó y pasa.`); turn=next(turn); setTimeout(turnLoop, PACE[cfg.speed]*0.5); } }); }
  }
  function scoreCard(c){ if(c.v==="+4")return 5; if(["+2","skip","rev"].includes(c.v))return 4; if(c.v==="wild")return 1; return 2; }

  // ── animaciones ──
  function animatePlay(p, idx, chosen){
    busy=true; const card=hands[p].splice(idx,1)[0];
    const from=seatPos(p);
    anims.push({card,x:from.x-CW/2,y:from.y-CH/2,tx:DISCARD.x,ty:DISCARD.y,t:0,dur:PACE[cfg.speed]*0.55,onDone:()=>finishPlay(p,card,chosen)});
    NovaAudio.play(["+4","+2"].includes(card.v)?"drop":"move");
  }
  function finishPlay(p, card, chosen){
    discard.push(card);
    if(card.c==="w"){ curColor=chosen||["r","y","g","b"][(Math.random()*4)|0]; card.chosen=curColor; curVal="wild"; colorFlash=24; }
    else { curColor=card.c; curVal=card.v; }
    let skip=false;
    if(card.v==="rev"){ dir*=-1; if(np===2)skip=true; }
    if(card.v==="skip") skip=true;
    if(card.v==="+2"){ const t=next(turn); drawN(t,2); skip=true; }
    if(card.v==="+4"){ const t=next(turn); drawN(t,4); skip=true; }
    if(hands[p].length===1){ unoCall={p,t:90}; msg(`${who(p)} ¡UNO!`); }
    if(hands[p].length===0) return win(p);
    turn=next(turn, skip?2:1);
    busy=false; setTimeout(turnLoop, 250);
  }
  function animateDraw(p, n, done){
    busy=true; let k=0;
    (function one(){ if(k>=n){ busy=false; done&&done(); return; } drawN(p,1); const to=seatPos(p);
      anims.push({card:{c:"w",v:"back"},x:DRAW.x,y:DRAW.y,tx:to.x-CW/2,ty:to.y-CH/2,t:0,dur:PACE[cfg.speed]*0.4,onDone:()=>{ k++; one(); }});
      NovaAudio.play("ui");
    })();
  }
  function who(p){ return p===0?"Tú":"IA "+p; }
  function msg(t){ msgEl.textContent=t; }

  function humanDraw(){ if(state!=="play"||turn!==0||busy||anims.length)return; animateDraw(0,1,()=>{ const c=hands[0][hands[0].length-1]; if(playable(c)) msg("Robaste una jugable: clic para jugarla."); else { msg("Sin jugada — pasas."); turn=next(turn); setTimeout(turnLoop,300); } }); }
  function win(p){ state="over"; NovaAudio.stopMusic(); NovaAudio.play(p===0?"win":"over"); ovTitle.textContent=p===0?"¡GANASTE!":"PERDISTE"; ovTitle.className=p===0?"win":"lose"; ovMsg.textContent=p===0?"Te quedaste sin cartas.":`Ganó ${who(p)}.`; ovBtn.textContent="↻ Nuevo"; ov.classList.add("show"); }

  // ── render gráfico ──
  function drawCardFace(card,x,y,sel,scale=1){
    const w=CW*scale,h=CH*scale; const base=card.c==="w"?DARK.w:COLORS[card.c];
    // sombra
    ctx.save(); if(sel&&cfg.glow){ ctx.shadowColor=css("--accent"); ctx.shadowBlur=16; } else { ctx.shadowColor="rgba(0,0,0,.4)"; ctx.shadowBlur=6; ctx.shadowOffsetY=3; }
    const g=ctx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,base); g.addColorStop(1, card.c==="w"?"#0c0c1a":DARK[card.c]||base);
    ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(x,y,w,h,10*scale); ctx.fill(); ctx.restore();
    ctx.strokeStyle=sel?css("--accent"):"rgba(255,255,255,.7)"; ctx.lineWidth=sel?3:2; ctx.beginPath(); ctx.roundRect(x,y,w,h,10*scale); ctx.stroke();
    // óvalo central blanco
    ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.rotate(-0.35); ctx.fillStyle="rgba(255,255,255,.9)"; ctx.beginPath(); ctx.ellipse(0,0,w*0.34,h*0.42,0,0,7); ctx.fill(); ctx.restore();
    const lbl=({skip:"⊘",rev:"⇄","+2":"+2","+4":"+4",wild:"★"})[card.v]||card.v;
    ctx.fillStyle = card.c==="w"?"#222":(DARK[card.c]||"#222");
    ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font=`700 ${26*scale}px "Chakra Petch"`; ctx.fillText(lbl,x+w/2,y+h/2+1);
    // esquinas
    ctx.fillStyle="rgba(255,255,255,.95)"; ctx.font=`700 ${12*scale}px "Chakra Petch"`; ctx.textAlign="left"; ctx.fillText(lbl,x+6*scale,y+13*scale); ctx.textAlign="right"; ctx.fillText(lbl,x+w-6*scale,y+h-7*scale);
    if(card.c==="w"&&card.chosen){ ctx.fillStyle=COLORS[card.chosen]; ctx.beginPath(); ctx.arc(x+w-12*scale,y+12*scale,6*scale,0,7); ctx.fill(); }
  }
  function drawBack(x,y,scale=1){ const w=CW*scale,h=CH*scale; ctx.fillStyle=css("--surface-2"); ctx.strokeStyle=css("--border"); ctx.lineWidth=2; ctx.beginPath(); ctx.roundRect(x,y,w,h,10*scale); ctx.fill(); ctx.stroke(); ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.rotate(-0.35); ctx.fillStyle=css("--accent"); ctx.globalAlpha=.85; ctx.font=`700 ${20*scale}px "Bungee"`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("UNO",0,0); ctx.restore(); }

  function render(){
    handRects=[];
    ctx.fillStyle=css("--bg-2"); ctx.fillRect(0,0,W,H);
    if(colorFlash>0){ ctx.fillStyle=COLORS[curColor]; ctx.globalAlpha=colorFlash/80; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1; colorFlash--; }
    if(!hands){ return; }
    // oponentes: abanicos de dorsos + nombre + ring de turno
    oppSeats().forEach(pi=>{ const s=seatPos(pi); const cnt=hands[pi].length; const horiz=(pi===2);
      for(let i=0;i<cnt;i++){ const off=(i-(cnt-1)/2)*(horiz?16:0), offv=(i-(cnt-1)/2)*(horiz?0:13); drawBack(s.x-CW*0.35+off, s.y-CH*0.35+offv, 0.7); }
      ctx.fillStyle=turn===pi?css("--accent"):css("--text-dim"); ctx.font='700 12px "Chakra Petch"'; ctx.textAlign="center";
      ctx.fillText(`IA ${pi} · ${cnt}`, s.x, pi===2? s.y+34 : s.y + (CH*0.5)+12);
      if(turn===pi){ ctx.strokeStyle=css("--accent"); ctx.lineWidth=2; ctx.beginPath(); ctx.arc(s.x, s.y, 4,0,7); ctx.stroke(); }
    });
    // mazo y descarte
    drawBack(DRAW.x, DRAW.y); ctx.fillStyle=css("--text-dim"); ctx.font='700 10px "Chakra Petch"'; ctx.textAlign="center"; ctx.fillText("ROBAR", DRAW.x+CW/2, DRAW.y+CH+12);
    const top=discard[discard.length-1]; if(top) drawCardFace(top, DISCARD.x, DISCARD.y, false);
    // indicador color actual
    ctx.fillStyle=COLORS[curColor]; if(cfg.glow){ctx.shadowColor=COLORS[curColor];ctx.shadowBlur=12;} ctx.beginPath(); ctx.roundRect(DISCARD.x+CW+14, DISCARD.y+CH/2-12, 22, 22, 5); ctx.fill(); ctx.shadowBlur=0;
    // dirección
    ctx.fillStyle=css("--text-dim"); ctx.font='16px serif'; ctx.fillText(dir===1?"↻":"↺", DISCARD.x+CW/2, DISCARD.y-12);
    // mano humana
    const hand=hands[0]; const totalW=Math.min(W-20, hand.length*(CW+6)); const step=hand.length>1?(totalW-CW)/(hand.length-1):0; const sx=(W-totalW)/2, y=H-CH-10;
    hand.forEach((card,i)=>{ const x=sx+i*step; const ok=turn===0&&state==="play"&&!busy&&!anims.length&&playable(card); const yy=ok?y-10:y; drawCardFace(card,x,yy,ok); handRects.push({x,y:yy,w:CW,h:CH,i,ok}); });
    if(turn===0&&!busy&&!anims.length){ ctx.strokeStyle=css("--accent"); ctx.lineWidth=2; ctx.globalAlpha=.5; ctx.beginPath(); ctx.roundRect(sx-6,y-16,totalW+12,CH+18,12); ctx.stroke(); ctx.globalAlpha=1; }
    // animaciones en vuelo
    anims.forEach(a=>{ const k=Math.min(1,a.t/a.dur), e=1-Math.pow(1-k,3); const x=a.x+(a.tx-a.x)*e, yy=a.y+(a.ty-a.y)*e; if(a.card.v==="back") drawBack(x,yy); else drawCardFace(a.card,x,yy,false); });
    // ¡UNO!
    if(unoCall.t>0){ const s=seatPos(unoCall.p); ctx.fillStyle=css("--accent-2"); ctx.font='700 26px "Bungee"'; ctx.textAlign="center"; ctx.globalAlpha=Math.min(1,unoCall.t/30); if(cfg.glow){ctx.shadowColor=css("--accent-2");ctx.shadowBlur=16;} ctx.fillText("¡UNO!", s.x, s.y); ctx.shadowBlur=0; ctx.globalAlpha=1; unoCall.t--; }
  }
  let lastT=0;
  function loop(now){ if(state!=="play"&&!anims.length){ render(); return; }
    const dt=now?Math.min(60,now-lastT):16; lastT=now||0;
    for(let i=anims.length-1;i>=0;i--){ anims[i].t+=dt; if(anims[i].t>=anims[i].dur){ const a=anims.splice(i,1)[0]; a.onDone&&a.onDone(); } }
    render(); raf=requestAnimationFrame(loop);
  }

  cv.addEventListener("click", e=>{
    if(state!=="play"||turn!==0||busy||anims.length) return;
    const rect=cv.getBoundingClientRect(); const x=(e.clientX-rect.left)*(W/rect.width), y=(e.clientY-rect.top)*(H/rect.height);
    for(let k=handRects.length-1;k>=0;k--){ const r=handRects[k]; if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h){ if(!r.ok){ msg("Esa carta no coincide en color ni número."); return; } const card=hands[0][r.i]; if(card.c==="w"){ pendingWild=r.i; picker.classList.add("show"); return; } animatePlay(0,r.i); return; } }
  });
  picker.querySelectorAll(".swatch").forEach(s=>s.onclick=()=>{ picker.classList.remove("show"); if(pendingWild!=null){ const i=pendingWild; pendingWild=null; animatePlay(0,i,s.dataset.c); } });

  ovBtn.onclick=()=>{ start(); };
  document.getElementById("draw").onclick=humanDraw;
  document.getElementById("restart").onclick=()=>{ state="idle"; hands=null; cancelAnimationFrame(raf); ovTitle.textContent="UNO"; ovTitle.className=""; ovMsg.textContent="Tú vs IA. Quédate sin cartas."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({ gameId:"uno", onChange:(k)=>{}, extra:[
    { title:"Juego", rows:[
      { type:"select", key:"players", label:"Jugadores", default:"4", options:[{value:"2",label:"2 (1 IA)"},{value:"3",label:"3 (2 IA)"},{value:"4",label:"4 (3 IA)"}] },
      { type:"select", key:"speed", label:"Ritmo", default:"normal", options:[{value:"rapido",label:"Rápido"},{value:"normal",label:"Normal"},{value:"lento",label:"Lento (explicado)"}] },
    ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Jugar", value:"Clic en carta válida" }, { type:"keys", label:"Robar", value:"Botón Robar" } ]},
  ]});
  document.addEventListener("nova-theme-change", ()=>{ if(hands)render(); });
  render();
})();
