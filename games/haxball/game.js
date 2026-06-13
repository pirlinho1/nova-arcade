/* HaxBall FC — NOVA ARCADE. Fútbol top-down con física. Tú (rojo, izq) vs IA (azul, der). */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const spEl = document.getElementById("sp"), saEl = document.getElementById("sa");
  const W = cv.width, H = cv.height, WALL = 14;
  const GOAL_H = 120, GY0 = (H-GOAL_H)/2, GY1 = GY0+GOAL_H;

  let cfg = Object.assign({ win:"5", ai:"normal", glow:true }, NovaSettings.loadCfg("haxball"));
  const AISPD = { facil:0.22, normal:0.32, dificil:0.45 };
  let me_, ai, ball, sp, sa, state="idle", raf=null, last=0, keys={};

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function mk(x,y,r,m){ return {x,y,vx:0,vy:0,r,m}; }
  function reset(dir){ // dir: a quién saca
    me_=mk(W*0.28,H/2,15,3); ai=mk(W*0.72,H/2,15,3); ball=mk(W/2,H/2,9,1);
    me_.vx=me_.vy=ai.vx=ai.vy=ball.vx=ball.vy=0;
  }
  function newGame(){ sp=0; sa=0; spEl.textContent=0; saEl.textContent=0; reset(); }
  function start(){ if(state==="play")return; if(state!=="play"&&state!=="pause") newGame(); if(state!=="pause"){} state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("chip",128); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(frame); }

  function frame(now){ const dt=Math.min(40, now-last)/16.7; last=now; if(state!=="play")return; step(dt); draw(); raf=requestAnimationFrame(frame); }

  function step(dt){
    // input jugador
    const acc=0.6;
    if(keys.up) me_.vy-=acc*dt; if(keys.down) me_.vy+=acc*dt;
    if(keys.left) me_.vx-=acc*dt; if(keys.right) me_.vx+=acc*dt;
    if(keys.kick) kick(me_);
    // IA: ir a la pelota; si está del lado correcto, empujar hacia portería izquierda (la del jugador) -> IA ataca izquierda
    const spd=AISPD[cfg.ai]*dt*16;
    const tx = ball.x + (ball.x<ai.x? -20: 20), ty=ball.y;
    const dax=tx-ai.x, day=ty-ai.y, dl=Math.hypot(dax,day)||1;
    ai.vx += (dax/dl)*0.5*dt; ai.vy += (day/dl)*0.5*dt;
    // limitar velocidad discos
    cap(me_,5.5); cap(ai,5.0+ (cfg.ai==="dificil"?1:0));
    // IA patea si cerca y la pelota va hacia su objetivo (izquierda)
    if(dist(ai,ball)<ai.r+ball.r+6 && Math.random()<0.5) kickToward(ai, 0, ball.y>H/2?ball.y-40:ball.y+40);
    // fricción
    [me_,ai,ball].forEach(o=>{ o.vx*=0.94; o.vy*=0.94; o.x+=o.vx*dt; o.y+=o.vy*dt; });
    // colisiones disco-pelota y disco-disco
    collide(me_,ball,true); collide(ai,ball,true); collide(me_,ai,false);
    // paredes
    walls(me_); walls(ai); ballWalls();
    // gol
    if(ball.x-ball.r < WALL && ball.y>GY0 && ball.y<GY1){ goal("ai"); }
    else if(ball.x+ball.r > W-WALL && ball.y>GY0 && ball.y<GY1){ goal("me"); }
  }
  function cap(o,mx){ const s=Math.hypot(o.vx,o.vy); if(s>mx){ o.vx=o.vx/s*mx; o.vy=o.vy/s*mx; } }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
  function kick(o){ if(dist(o,ball)<o.r+ball.r+8){ kickToward(o, ball.x+(o.vx*4||5), ball.y+o.vy*4); } }
  function kickToward(o,tx,ty){ const dx=tx-o.x, dy=ty-o.y, d=Math.hypot(dx,dy)||1; ball.vx+=dx/d*6; ball.vy+=dy/d*6; NovaAudio.play("move"); }
  function collide(a,b,elastic){ const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, min=a.r+b.r;
    if(d<min){ const nx=dx/d, ny=dy/d, overlap=min-d;
      // separar
      const ta=b.m/(a.m+b.m), tb=a.m/(a.m+b.m);
      a.x-=nx*overlap*ta; a.y-=ny*overlap*ta; b.x+=nx*overlap*tb; b.y+=ny*overlap*tb;
      // impulso elástico simple
      const rvx=b.vx-a.vx, rvy=b.vy-a.vy, vn=rvx*nx+rvy*ny; if(vn>0) return;
      const e=elastic?1.3:0.9; const j=-(1+e)*vn/(1/a.m+1/b.m);
      a.vx-=j*nx/a.m; a.vy-=j*ny/a.m; b.vx+=j*nx/b.m; b.vy+=j*ny/b.m;
    } }
  function walls(o){ if(o.x<WALL+o.r){o.x=WALL+o.r;o.vx*=-0.4;} if(o.x>W-WALL-o.r){o.x=W-WALL-o.r;o.vx*=-0.4;} if(o.y<WALL+o.r){o.y=WALL+o.r;o.vy*=-0.4;} if(o.y>H-WALL-o.r){o.y=H-WALL-o.r;o.vy*=-0.4;} }
  function ballWalls(){ const o=ball;
    // arriba/abajo
    if(o.y<WALL+o.r){o.y=WALL+o.r;o.vy*=-0.85;} if(o.y>H-WALL-o.r){o.y=H-WALL-o.r;o.vy*=-0.85;}
    // izquierda/derecha salvo apertura de portería
    const inGoalY = o.y>GY0 && o.y<GY1;
    if(o.x<WALL+o.r && !inGoalY){o.x=WALL+o.r;o.vx*=-0.85;}
    if(o.x>W-WALL-o.r && !inGoalY){o.x=W-WALL-o.r;o.vx*=-0.85;}
  }
  function goal(who){ if(who==="me"){ sp++; spEl.textContent=sp; NovaAudio.play("win"); } else { sa++; saEl.textContent=sa; NovaAudio.play("over"); }
    if(sp>=+cfg.win||sa>=+cfg.win){ return end(sp>sa); }
    flash(); reset(); }
  let flashT=0; function flash(){ flashT=20; }
  function end(youWin){ state="over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); NovaAudio.play(youWin?"win":"over"); ovTitle.textContent=youWin?"¡GANASTE!":"PERDISTE"; ovTitle.className=youWin?"win":"lose"; ovMsg.textContent=`${sp} – ${sa}`; ovBtn.textContent="↻ Revancha"; ov.classList.add("show"); }
  function togglePause(){ if(state==="play"){ state="pause"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); ovTitle.textContent="PAUSA"; ovTitle.className=""; ovMsg.textContent=`${sp} – ${sa}`; ovBtn.textContent="▶ Continuar"; ov.classList.add("show"); } else if(state==="pause"){ start(); } }

  function draw(){
    ctx.fillStyle=css("--bg-2"); ctx.fillRect(0,0,W,H);
    // campo
    ctx.strokeStyle=css("--border"); ctx.lineWidth=3; ctx.strokeRect(WALL,WALL,W-2*WALL,H-2*WALL);
    ctx.beginPath(); ctx.moveTo(W/2,WALL); ctx.lineTo(W/2,H-WALL); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2,H/2,46,0,7); ctx.stroke();
    // porterías
    ctx.strokeStyle=css("--accent-2"); ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(WALL,GY0); ctx.lineTo(WALL,GY1); ctx.stroke();
    ctx.strokeStyle=css("--accent-3"); ctx.beginPath(); ctx.moveTo(W-WALL,GY0); ctx.lineTo(W-WALL,GY1); ctx.stroke();
    if(flashT>0){ ctx.fillStyle=css("--accent-3"); ctx.globalAlpha=flashT/40; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1; flashT--; }
    disc(me_, css("--accent-2"), "TÚ"); disc(ai, css("--accent"), "IA");
    // pelota
    ctx.fillStyle=css("--text"); if(cfg.glow){ctx.shadowColor=css("--text");ctx.shadowBlur=10;} ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,7); ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle="#000"; ctx.lineWidth=1; ctx.stroke();
  }
  function disc(o,color,lbl){ ctx.fillStyle=color; if(cfg.glow){ctx.shadowColor=color;ctx.shadowBlur=12;} ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,7); ctx.fill(); ctx.shadowBlur=0; ctx.strokeStyle="rgba(255,255,255,.6)"; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle="#06060c"; ctx.font='700 9px "Chakra Petch"'; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(lbl,o.x,o.y); }

  const km={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",w:"up",s:"down",a:"left",d:"right",W:"up",S:"down",A:"left",D:"right"," ":"kick"};
  document.addEventListener("keydown",e=>{ if(e.key==="p"||e.key==="P"){togglePause();return;} const k=km[e.key]; if(k){ e.preventDefault(); keys[k]=true; if((state==="idle"||state==="over")&&k!=="kick") start(); } });
  document.addEventListener("keyup",e=>{ const k=km[e.key]; if(k){ keys[k]=false; } });
  document.querySelectorAll("#dpad button").forEach(b=>{ const d=b.dataset.dir; const on=()=>{keys[d]=true; if(state==="idle"||state==="over")start();}; const off=()=>keys[d]=false; b.addEventListener("touchstart",e=>{e.preventDefault();on();},{passive:false}); b.addEventListener("touchend",e=>{e.preventDefault();off();}); b.addEventListener("mousedown",on); b.addEventListener("mouseup",off); b.addEventListener("mouseleave",off); });

  ovBtn.onclick=()=>{ if(state==="over"){ newGame(); } start(); };
  document.getElementById("pause").onclick=togglePause;
  document.getElementById("restart").onclick=()=>{ state="over"; newGame(); start(); };

  NovaSettings.mount({ gameId:"haxball", onChange:()=>{}, extra:[
    { title:"Juego", rows:[
      { type:"select", key:"win", label:"Goles para ganar", default:"5", options:[{value:"3",label:"3"},{value:"5",label:"5"},{value:"10",label:"10"}] },
      { type:"select", key:"ai", label:"Dificultad IA", default:"normal", options:[{value:"facil",label:"Fácil"},{value:"normal",label:"Normal"},{value:"dificil",label:"Difícil"}] },
    ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Mover", value:"WASD / flechas" }, { type:"keys", label:"Patear", value:"Espacio" }, { type:"keys", label:"Pausa", value:"P" } ]},
  ]});
  document.addEventListener("nova-theme-change", ()=>{ if(ball)draw(); });
  newGame(); draw();
})();
