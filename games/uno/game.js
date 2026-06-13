/* UNO — NOVA ARCADE. Humano (0) vs 3 IA (1,2,3). */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const msgEl = document.getElementById("msg"), picker = document.getElementById("colorpick");
  const COLORS = { r:"#ff3b3b", y:"#ffd23b", g:"#3bff7b", b:"#3b9bff", w:"#2a2a44" };
  const CW=58, CH=86;
  let cfg = Object.assign({ players:"4", glow:true }, NovaSettings.loadCfg("uno"));
  let hands, draw, discard, curColor, curVal, dir, turn, np, state="idle", busy=false, pendingWild=null, handRects=[];

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function buildDeck(){
    const d=[]; for(const c of ["r","y","g","b"]){ d.push({c,v:"0"}); for(let n=1;n<=9;n++){ d.push({c,v:String(n)}); d.push({c,v:String(n)}); }
      for(const a of ["skip","rev","+2"]){ d.push({c,v:a}); d.push({c,v:a}); } }
    for(let i=0;i<4;i++){ d.push({c:"w",v:"wild"}); d.push({c:"w",v:"+4"}); }
    for(let i=d.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [d[i],d[j]]=[d[j],d[i]]; } return d;
  }
  function setup(){
    np=parseInt(cfg.players); draw=buildDeck(); hands=Array.from({length:np},()=>draw.splice(0,7));
    let first; do { first=draw.shift(); } while(first.c==="w"); // primera carta no comodín
    discard=[first]; curColor=first.c; curVal=first.v; dir=1; turn=0;
    state="play"; busy=false; applyStart(first);
  }
  function applyStart(card){ // efectos si la primera es de acción (simplificado: skip/rev/+2 actúan sobre el primer jugador)
    if(card.v==="rev") dir=-1;
    if(card.v==="skip") turn=next(turn);
    if(card.v==="+2"){ drawN(0,2); turn=next(turn); }
  }
  function next(t,steps=1){ return ((t + dir*steps) % np + np) % np; }
  function reshuffle(){ if(draw.length) return; const top=discard.pop(); draw=discard; discard=[top]; for(let i=draw.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [draw[i],draw[j]]=[draw[j],draw[i]]; } draw.forEach(c=>{ if(c.c==="w") c.chosen=null; }); }
  function drawN(p,n){ for(let k=0;k<n;k++){ reshuffle(); if(draw.length) hands[p].push(draw.shift()); } }

  function playable(card){ return card.c==="w" || card.c===curColor || card.v===curVal; }
  function start(){ if(state==="play"&&hands)return; setup(); ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("chip",110); render(); turnLoop(); }

  function playCard(p, idx, chosenColor){
    const card = hands[p].splice(idx,1)[0]; discard.push(card);
    if(card.c==="w"){ curColor = chosenColor || ["r","y","g","b"][(Math.random()*4)|0]; card.chosen=curColor; curVal="wild"; }
    else { curColor=card.c; curVal=card.v; }
    NovaAudio.play(card.v==="+4"||card.v==="+2"?"drop":"move");
    // efectos
    let skipNext=false;
    if(card.v==="rev"){ dir*=-1; if(np===2) skipNext=true; }
    if(card.v==="skip") skipNext=true;
    if(card.v==="+2"){ const t=next(turn); drawN(t,2); skipNext=true; }
    if(card.v==="+4"){ const t=next(turn); drawN(t,4); skipNext=true; }
    if(hands[p].length===0) return win(p);
    if(hands[p].length===1) msg(`${who(p)} dice ¡UNO!`);
    turn = next(turn, skipNext?2:1);
    render(); turnLoop();
  }
  function who(p){ return p===0?"Tú": "IA "+p; }
  function msg(t){ msgEl.textContent=t; }

  function turnLoop(){
    if(state!=="play") return;
    render();
    if(turn===0){ msg("Tu turno. Juega una carta válida o roba."); busy=false; return; }
    busy=true; msg(`Turno de IA ${turn}…`);
    setTimeout(aiTurn, 650);
  }
  function aiTurn(){
    if(state!=="play") return;
    const hand=hands[turn];
    // elegir: preferir cartas de acción/números que coincidan; comodín como último recurso
    let opts = hand.map((c,i)=>({c,i})).filter(o=>playable(o.c));
    if(opts.length){
      // heurística: jugar no-comodín primero, preferir +2/+4/skip si rival va ganando
      opts.sort((a,b)=> score(b.c)-score(a.c));
      const pick=opts[0];
      let chosen=null;
      if(pick.c.c==="w"){ const counts={r:0,y:0,g:0,b:0}; hand.forEach(c=>{ if(counts[c.c]!=null)counts[c.c]++; }); chosen=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]; }
      playCard(turn, pick.i, chosen);
    } else { // robar y, si sirve, jugar
      drawN(turn,1); const c=hands[turn][hands[turn].length-1];
      if(playable(c)){ const chosen=c.c==="w"?["r","y","g","b"][(Math.random()*4)|0]:null; playCard(turn, hands[turn].length-1, chosen); }
      else { turn=next(turn); render(); turnLoop(); }
    }
  }
  function score(c){ if(c.v==="+4")return 5; if(c.v==="+2"||c.v==="skip"||c.v==="rev")return 4; if(c.v==="wild")return 1; return 2; }

  function humanDraw(){
    if(state!=="play"||turn!==0||busy) return;
    drawN(0,1); const c=hands[0][hands[0].length-1]; NovaAudio.play("ui");
    if(playable(c)) msg("Robaste una jugable: clic para jugarla, o pasa robando de nuevo.");
    else { msg("Sin jugada — pasa el turno."); turn=next(turn); render(); turnLoop(); }
    render();
  }
  function win(p){ state="over"; NovaAudio.stopMusic(); NovaAudio.play(p===0?"win":"over"); ovTitle.textContent=p===0?"¡GANASTE!":"PERDISTE"; ovTitle.className=p===0?"win":"lose"; ovMsg.textContent=p===0?"Te quedaste sin cartas.":`Ganó ${who(p)}.`; ovBtn.textContent="↻ Nuevo"; ov.classList.add("show"); }

  // ── render ──
  function drawCard(card,x,y,faceUp=true,sel=false){
    const fill = faceUp ? (card.c==="w"?css("--surface-2"):COLORS[card.c]) : css("--surface-2");
    ctx.fillStyle=fill; ctx.strokeStyle=sel?css("--accent"):css("--border"); ctx.lineWidth=sel?3:1.5;
    if(sel&&cfg.glow){ ctx.shadowColor=css("--accent"); ctx.shadowBlur=12; }
    ctx.beginPath(); ctx.roundRect(x,y,CW,CH,9); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
    if(!faceUp){ ctx.fillStyle=css("--accent"); ctx.globalAlpha=.5; ctx.font='700 22px "Bungee"'; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("U",x+CW/2,y+CH/2); ctx.globalAlpha=1; return; }
    const lbl = ({skip:"⊘",rev:"⇄","+2":"+2","+4":"+4",wild:"★"})[card.v] || card.v;
    ctx.fillStyle = (card.c==="y")?"#222":"#fff"; ctx.font='700 20px "Chakra Petch"'; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(lbl, x+CW/2, y+CH/2);
    ctx.font='700 11px "Chakra Petch"'; ctx.textAlign="left"; ctx.fillText(lbl, x+6, y+12);
    if(card.c==="w" && card.chosen){ ctx.fillStyle=COLORS[card.chosen]; ctx.beginPath(); ctx.arc(x+CW-12,y+12,6,0,7); ctx.fill(); }
  }
  function render(){
    handRects=[];
    ctx.fillStyle=css("--bg-2"); ctx.fillRect(0,0,cv.width,cv.height);
    // oponentes (conteos)
    const opp=[[336,28,"top"],[40,200,"left"],[632,200,"right"]].slice(0,np-1);
    const oppIdx=[2,1,3].slice(0,np-1);
    oppIdx.forEach((pi,k)=>{ const [x,y]=opp[k]; ctx.fillStyle = turn===pi?css("--accent"):css("--text-dim"); ctx.font='700 13px "Chakra Petch"'; ctx.textAlign="center";
      ctx.fillText(`IA ${pi}: ${hands[pi].length}🂠`, x, y); });
    // mazo + descarte (centro)
    drawCard({c:"w",v:""}, 270, 190, false);
    const top=discard[discard.length-1]; drawCard(top, 344, 190, true);
    // indicador color actual
    ctx.fillStyle=COLORS[curColor]; ctx.beginPath(); ctx.roundRect(344+CW+12,190,16,CH,6); ctx.fill();
    // mano humana
    const hand=hands[0]; const totalW=Math.min(cv.width-20, hand.length*(CW+6)); const step=hand.length>1?(totalW-CW)/(hand.length-1):0; const startX=(cv.width-totalW)/2; const y=cv.height-CH-12;
    hand.forEach((card,i)=>{ const x=startX+i*step; const ok = turn===0 && state==="play" && playable(card); drawCard(card,x,y,true,ok); handRects.push({x,y,w:CW,h:CH,i,ok}); });
  }

  cv.addEventListener("click", e=>{
    if(state!=="play"||turn!==0||busy) return;
    const rect=cv.getBoundingClientRect(); const x=(e.clientX-rect.left)*(cv.width/rect.width), y=(e.clientY-rect.top)*(cv.height/rect.height);
    // de atrás hacia adelante (la última carta está encima)
    for(let k=handRects.length-1;k>=0;k--){ const r=handRects[k]; if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h){ if(!r.ok){ msg("Esa carta no coincide."); return; }
      const card=hands[0][r.i];
      if(card.c==="w"){ pendingWild=r.i; picker.classList.add("show"); return; }
      playCard(0, r.i); return; } }
  });
  picker.querySelectorAll(".swatch").forEach(s=>s.onclick=()=>{ picker.classList.remove("show"); if(pendingWild!=null){ const i=pendingWild; pendingWild=null; playCard(0,i,s.dataset.c); } });

  ovBtn.onclick=()=>{ start(); };
  document.getElementById("draw").onclick=humanDraw;
  document.getElementById("restart").onclick=()=>{ state="idle"; hands=null; ovTitle.textContent="UNO"; ovTitle.className=""; ovMsg.textContent="Tú vs 3 IA. Quédate sin cartas."; ovBtn.textContent="▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({ gameId:"uno", onChange:(k)=>{ if(k==="players"&&state!=="play"){} if(hands)render(); }, extra:[
    { title:"Juego", rows:[ { type:"select", key:"players", label:"Jugadores", default:"4", options:[{value:"2",label:"2 (1 IA)"},{value:"3",label:"3 (2 IA)"},{value:"4",label:"4 (3 IA)"}] } ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Jugar carta", value:"Clic en carta válida" }, { type:"keys", label:"Robar", value:"Botón Robar" } ]},
  ]});
  document.addEventListener("nova-theme-change", ()=>{ if(hands)render(); });
})();
