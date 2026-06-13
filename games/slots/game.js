/* Lucky Spin (Tragaperras) — NOVA ARCADE. Fichas virtuales, sin dinero real. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const credEl = document.getElementById("credits"), betEl = document.getElementById("bet"), winEl = document.getElementById("lastwin");

  // símbolos con peso (rareza) y pago x apuesta por 3-en-línea
  const SYM = [
    { e:"🍒", w:7,  pay:3 }, { e:"🍋", w:6, pay:4 }, { e:"🔔", w:5, pay:6 },
    { e:"⭐", w:4,  pay:10 }, { e:"💎", w:2, pay:20 }, { e:"7️⃣", w:1, pay:50 },
  ];
  const BETS = [1,5,10,25];
  const REELS=3, ROWS=3, RW=120, RH=88, GAP=14, X0=18, Y0=24;

  let cfg = Object.assign({ glow:true }, NovaSettings.loadCfg("slots"));
  let credits, betIdx, reels, spinning, lastWin, state="idle", raf=null;

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function weightedSym(){ const tot=SYM.reduce((a,s)=>a+s.w,0); let r=Math.random()*tot; for(let i=0;i<SYM.length;i++){ if((r-=SYM[i].w)<0) return i; } return 0; }
  function strip(){ return Array.from({length:24},()=>weightedSym()); }

  function load(){ credits=+(localStorage.getItem("slots-credits")||100); betIdx=0;
    reels=Array.from({length:REELS},()=>({ s:strip(), pos:Math.random()*24, vel:0, stopAt:0, spinning:false }));
    spinning=false; lastWin=0; updateHUD(); }
  function save(){ localStorage.setItem("slots-credits", credits); }
  function updateHUD(){ credEl.textContent=credits; betEl.textContent=BETS[betIdx]; winEl.textContent=lastWin; }

  function start(){ if(state==="play")return; state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(credits<=0){ credits=100; save(); } updateHUD(); draw(); }

  function spin(){
    if(state!=="play"||spinning) return;
    const bet=BETS[betIdx];
    if(credits<bet){ ovMsg&&0; flashMsg("Sin créditos: recarga."); return; }
    credits-=bet; lastWin=0; updateHUD(); save();
    spinning=true; NovaAudio.play("drop");
    const t=performance.now();
    reels.forEach((r,i)=>{ r.spinning=true; r.vel=0.6+Math.random()*0.15; r.stopAt=t+700+i*420; });
    cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  }
  function loop(now){
    let anySpin=false;
    reels.forEach(r=>{ if(r.spinning){ anySpin=true; r.pos=(r.pos+r.vel)% r.s.length;
      if(now>=r.stopAt){ r.vel*=0.86; if(r.vel<0.06){ r.pos=Math.round(r.pos)%r.s.length; r.spinning=false; NovaAudio.play("move"); } } } });
    draw();
    if(anySpin) raf=requestAnimationFrame(loop); else { spinning=false; evaluate(); }
  }
  function symAt(r, row){ // símbolo en fila visible 'row' (0=top,1=center,2=bottom)
    const idx=(Math.round(r.pos)+row)%r.s.length; return r.s[(idx+r.s.length)%r.s.length];
  }
  function evaluate(){
    const center=reels.map(r=>symAt(r,1));
    let win=0, jackpot=false;
    if(center[0]===center[1]&&center[1]===center[2]){ const pay=SYM[center[0]].pay; win=pay*BETS[betIdx]; if(center[0]===5) jackpot=true; }
    else { // 2 cerezas de izquierda paga x2
      const cher = center.filter(s=>s===0).length; if(cher>=2) win=2*BETS[betIdx];
    }
    if(win>0){ credits+=win; lastWin=win; NovaAudio.play(jackpot?"win":"point"); flashWin=jackpot?60:30; }
    else { lastWin=0; }
    updateHUD(); save(); draw();
    if(credits<=0){ flashMsg("Te quedaste sin créditos. Pulsa Recargar."); }
  }
  function flashMsg(t){ ovTitle.textContent="LUCKY SPIN"; ovTitle.className=""; ovMsg.textContent=t; ovBtn.textContent="▶ Seguir"; ov.classList.add("show"); state="idle"; }

  let flashWin=0;
  function draw(){
    ctx.fillStyle=css("--bg-2"); ctx.fillRect(0,0,cv.width,cv.height);
    // marco máquina
    ctx.strokeStyle=css("--accent"); ctx.lineWidth=3; ctx.strokeRect(8,8,cv.width-16,cv.height-16);
    for(let i=0;i<REELS;i++){ const x=X0+i*(RW+GAP);
      // ventana del rodillo
      ctx.fillStyle=css("--surface-solid"); ctx.strokeStyle=css("--border"); ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(x,Y0,RW,RH*ROWS+12,12); ctx.fill(); ctx.stroke();
      const r=reels[i];
      for(let row=0;row<ROWS;row++){ const s=SYM[symAt(r,row)]; const cy=Y0+10+row*RH+RH/2;
        const isCenter=row===1;
        if(isCenter){ ctx.fillStyle=css("--accent-3"); ctx.globalAlpha=.12; ctx.fillRect(x+4,Y0+10+RH,RW-8,RH); ctx.globalAlpha=1; }
        ctx.font=`${isCenter?52:44}px serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
        if(r.spinning){ ctx.globalAlpha=.5; } ctx.fillText(s.e, x+RW/2, cy); ctx.globalAlpha=1;
      }
    }
    // línea de pago central
    ctx.strokeStyle=css("--accent-2"); ctx.lineWidth=2; ctx.setLineDash([8,6]); const ly=Y0+10+RH+RH/2; ctx.beginPath(); ctx.moveTo(12,ly); ctx.lineTo(cv.width-12,ly); ctx.stroke(); ctx.setLineDash([]);
    if(flashWin>0){ ctx.fillStyle=css("--accent-3"); ctx.globalAlpha=flashWin/120; ctx.fillRect(0,0,cv.width,cv.height); ctx.globalAlpha=1; flashWin--; if(flashWin>0)requestAnimationFrame(draw); }
  }

  document.getElementById("spin").onclick=()=>{ if(state==="idle"){start();return;} spin(); };
  document.getElementById("betup").onclick=()=>{ if(!spinning){ betIdx=Math.min(BETS.length-1,betIdx+1); updateHUD(); NovaAudio.play("ui"); } };
  document.getElementById("betdown").onclick=()=>{ if(!spinning){ betIdx=Math.max(0,betIdx-1); updateHUD(); NovaAudio.play("ui"); } };
  document.getElementById("reset").onclick=()=>{ credits=100; lastWin=0; save(); updateHUD(); draw(); };
  ovBtn.onclick=start;
  document.addEventListener("keydown",e=>{ if(e.key===" "){ e.preventDefault(); if(state==="idle")start(); else spin(); } });

  NovaSettings.mount({ gameId:"slots", onChange:()=>draw(), extra:[
    { title:"Pagos (×apuesta, 3 en línea)", rows:[
      { type:"info", label:"🍒 / 🍋 / 🔔", value:"3× / 4× / 6×" },
      { type:"info", label:"⭐ / 💎 / 7️⃣", value:"10× / 20× / 50× (jackpot)" },
      { type:"info", label:"2× 🍒", value:"x2" },
    ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Girar", value:"Botón / Espacio" } ]},
  ]});
  document.addEventListener("nova-theme-change", draw);
  load(); draw();
})();
