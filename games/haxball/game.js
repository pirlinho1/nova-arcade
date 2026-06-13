/* HaxBall FC — NOVA ARCADE. Fútbol top-down con física. Equipo rojo (tú + IA) vs azul (IA). */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const spEl = document.getElementById("sp"), saEl = document.getElementById("sa");
  const W = cv.width, H = cv.height, WALL = 14;

  const STADIUMS = {
    clasico: { name:"Clásico", goalH:120, grass:"--bg-2", line:"--border" },
    grande:  { name:"Grande",  goalH:150, grass:"--bg-2", line:"--border" },
    futsal:  { name:"Futsal",  goalH:92,  grass:"--surface-2", line:"--accent" },
    neon:    { name:"Neón",    goalH:120, grass:"--bg",        line:"--accent" },
  };
  const AISPD = { facil:0.018, normal:0.030, dificil:0.044 };
  let cfg = Object.assign({ win:"5", ai:"normal", stadium:"clasico", per:"1", glow:true }, NovaSettings.loadCfg("haxball"));
  let GOAL_H, GY0, GY1, reds=[], blues=[], discs=[], me_, ball, sp, sa, state="idle", raf=null, last=0, keys={}, flashT=0;

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function mk(x,y,r,m,team,human){ return {x,y,vx:0,vy:0,r,m,team,human:!!human}; }

  function layout(){ GOAL_H=STADIUMS[cfg.stadium].goalH; GY0=(H-GOAL_H)/2; GY1=GY0+GOAL_H; }
  function reset(){
    const per=parseInt(cfg.per);
    reds=[]; blues=[];
    for(let i=0;i<per;i++){ const y=H*(i+1)/(per+1); reds.push(mk(W*0.28,y,15,3,"red",i===0)); blues.push(mk(W*0.72,y,15,3,"blue",false)); }
    me_=reds[0]; ball=mk(W/2,H/2,9,1,"ball",false);
    discs=[...reds,...blues];
  }
  function newGame(){ layout(); sp=0; sa=0; spEl.textContent=0; saEl.textContent=0; reset(); }
  function start(){ if(state==="play")return; if(state!=="pause") newGame(); state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("chip",128); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(frame); }
  function frame(now){ const dt=Math.min(40, now-last)/16.7; last=now; if(state!=="play")return; step(dt); draw(); raf=requestAnimationFrame(frame); }

  function step(dt){
    // jugador
    const acc=0.6;
    if(keys.up) me_.vy-=acc*dt; if(keys.down) me_.vy+=acc*dt;
    if(keys.left) me_.vx-=acc*dt; if(keys.right) me_.vx+=acc*dt;
    if(keys.kick) kick(me_);
    // IA por disco (rojos no-humanos atacan derecha; azules atacan izquierda)
    const spd=AISPD[cfg.ai];
    discs.forEach(d=>{ if(d.human) return;
      const attackRight = d.team==="red"; // dirección de ataque
      // rol: el más cercano a la pelota ataca, el resto defiende su mitad
      const mates = (d.team==="red"?reds:blues).filter(x=>!x.human||x.team!=="red");
      const nearest = teamNearest(d.team);
      let tx,ty;
      if(d===nearest){ tx=ball.x + (attackRight? -22:22); ty=ball.y; }
      else { tx = attackRight? W*0.3 : W*0.7; ty = H/2 + (ball.y-H/2)*0.6; }
      const dx=tx-d.x, dy=ty-d.y, dl=Math.hypot(dx,dy)||1;
      d.vx += (dx/dl)*spd*dt*16; d.vy += (dy/dl)*spd*dt*16;
      cap(d, 4.6 + (cfg.ai==="dificil"?1:0));
      if(dist(d,ball)<d.r+ball.r+6 && Math.random()<0.45){ const goalX = attackRight? W-WALL : WALL; kickToward(d, goalX, H/2); }
    });
    cap(me_,5.6);
    discs.forEach(o=>{ o.vx*=0.94; o.vy*=0.94; o.x+=o.vx*dt; o.y+=o.vy*dt; });
    ball.vx*=0.96; ball.vy*=0.96; ball.x+=ball.vx*dt; ball.y+=ball.vy*dt;
    // colisiones
    discs.forEach(d=>collide(d,ball,true));
    for(let i=0;i<discs.length;i++)for(let j=i+1;j<discs.length;j++) collide(discs[i],discs[j],false);
    discs.forEach(walls); ballWalls();
    if(ball.x-ball.r<WALL && ball.y>GY0 && ball.y<GY1) goal("ai");
    else if(ball.x+ball.r>W-WALL && ball.y>GY0 && ball.y<GY1) goal("me");
  }
  function teamNearest(team){ const arr=(team==="red"?reds:blues); let best=arr[0],bd=1e9; arr.forEach(d=>{ const x=dist(d,ball); if(x<bd){bd=x;best=d;} }); return best; }
  function cap(o,mx){ const s=Math.hypot(o.vx,o.vy); if(s>mx){ o.vx=o.vx/s*mx; o.vy=o.vy/s*mx; } }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
  function kick(o){ if(dist(o,ball)<o.r+ball.r+8) kickToward(o, ball.x+(o.vx*4||5), ball.y+o.vy*4); }
  function kickToward(o,tx,ty){ const dx=tx-o.x, dy=ty-o.y, d=Math.hypot(dx,dy)||1; ball.vx+=dx/d*6; ball.vy+=dy/d*6; NovaAudio.play("move"); }
  function collide(a,b,el){ const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,min=a.r+b.r; if(d<min){ const nx=dx/d,ny=dy/d,ov_=min-d,ta=b.m/(a.m+b.m),tb=a.m/(a.m+b.m); a.x-=nx*ov_*ta;a.y-=ny*ov_*ta;b.x+=nx*ov_*tb;b.y+=ny*ov_*tb; const rvx=b.vx-a.vx,rvy=b.vy-a.vy,vn=rvx*nx+rvy*ny; if(vn>0)return; const e=el?1.3:0.9,j=-(1+e)*vn/(1/a.m+1/b.m); a.vx-=j*nx/a.m;a.vy-=j*ny/a.m;b.vx+=j*nx/b.m;b.vy+=j*ny/b.m; } }
  function walls(o){ if(o.x<WALL+o.r){o.x=WALL+o.r;o.vx*=-0.4;} if(o.x>W-WALL-o.r){o.x=W-WALL-o.r;o.vx*=-0.4;} if(o.y<WALL+o.r){o.y=WALL+o.r;o.vy*=-0.4;} if(o.y>H-WALL-o.r){o.y=H-WALL-o.r;o.vy*=-0.4;} }
  function ballWalls(){ const o=ball; if(o.y<WALL+o.r){o.y=WALL+o.r;o.vy*=-0.85;} if(o.y>H-WALL-o.r){o.y=H-WALL-o.r;o.vy*=-0.85;} const inG=o.y>GY0&&o.y<GY1; if(o.x<WALL+o.r&&!inG){o.x=WALL+o.r;o.vx*=-0.85;} if(o.x>W-WALL-o.r&&!inG){o.x=W-WALL-o.r;o.vx*=-0.85;} }
  function goal(who){ if(who==="me"){ sp++; spEl.textContent=sp; NovaAudio.play("win"); } else { sa++; saEl.textContent=sa; NovaAudio.play("over"); } flashT=24; if(sp>=+cfg.win||sa>=+cfg.win) return end(sp>sa); reset(); }
  function end(youWin){ state="over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); NovaAudio.play(youWin?"win":"over"); ovTitle.textContent=youWin?"¡GANASTE!":"PERDISTE"; ovTitle.className=youWin?"win":"lose"; ovMsg.textContent=`${sp} – ${sa}`; ovBtn.textContent="↻ Revancha"; ov.classList.add("show"); }
  function togglePause(){ if(state==="play"){ state="pause"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); ovTitle.textContent="PAUSA"; ovTitle.className=""; ovMsg.textContent=`${sp} – ${sa}`; ovBtn.textContent="▶ Continuar"; ov.classList.add("show"); } else if(state==="pause") start(); }

  function draw(){
    ctx.fillStyle=css(STADIUMS[cfg.stadium].grass); ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=css(STADIUMS[cfg.stadium].line); ctx.lineWidth=3; ctx.strokeRect(WALL,WALL,W-2*WALL,H-2*WALL);
    ctx.beginPath(); ctx.moveTo(W/2,WALL); ctx.lineTo(W/2,H-WALL); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2,H/2,46,0,7); ctx.stroke();
    ctx.strokeStyle=css("--accent-2"); ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(WALL,GY0); ctx.lineTo(WALL,GY1); ctx.stroke();
    ctx.strokeStyle=css("--accent-3"); ctx.beginPath(); ctx.moveTo(W-WALL,GY0); ctx.lineTo(W-WALL,GY1); ctx.stroke();
    if(flashT>0){ ctx.fillStyle=css("--accent-3"); ctx.globalAlpha=flashT/48; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1; flashT--; }
    discs.forEach(d=> disc(d, d.team==="red"?css("--accent-2"):css("--accent"), d.human?"TÚ":(d.team==="red"?"R":"A")));
    ctx.fillStyle=css("--text"); if(cfg.glow){ctx.shadowColor=css("--text");ctx.shadowBlur=10;} ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,7); ctx.fill(); ctx.shadowBlur=0; ctx.strokeStyle="#000"; ctx.lineWidth=1; ctx.stroke();
  }
  function disc(o,color,lbl){ ctx.fillStyle=color; if(cfg.glow){ctx.shadowColor=color;ctx.shadowBlur=12;} ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,7); ctx.fill(); ctx.shadowBlur=0; ctx.strokeStyle="rgba(255,255,255,.6)"; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle="#06060c"; ctx.font='700 9px "Chakra Petch"'; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(lbl,o.x,o.y); }

  const km={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",w:"up",s:"down",a:"left",d:"right",W:"up",S:"down",A:"left",D:"right"," ":"kick"};
  document.addEventListener("keydown",e=>{ if(e.key==="p"||e.key==="P"){togglePause();return;} const k=km[e.key]; if(k){ e.preventDefault(); keys[k]=true; if((state==="idle"||state==="over")&&k!=="kick") start(); } });
  document.addEventListener("keyup",e=>{ const k=km[e.key]; if(k) keys[k]=false; });
  document.querySelectorAll("#dpad button").forEach(b=>{ const d=b.dataset.dir; const on=()=>{keys[d]=true; if(state==="idle"||state==="over")start();}; const off=()=>keys[d]=false; b.addEventListener("touchstart",e=>{e.preventDefault();on();},{passive:false}); b.addEventListener("touchend",e=>{e.preventDefault();off();}); b.addEventListener("mousedown",on); b.addEventListener("mouseup",off); b.addEventListener("mouseleave",off); });

  ovBtn.onclick=()=>{ if(state==="over"){ newGame(); } start(); };
  document.getElementById("pause").onclick=togglePause;
  document.getElementById("restart").onclick=()=>{ state="over"; newGame(); start(); };

  NovaSettings.mount({ gameId:"haxball", onChange:(k)=>{ if(["stadium","per"].includes(k) && state!=="play"){ newGame(); draw(); } }, extra:[
    { title:"Juego", rows:[
      { type:"select", key:"stadium", label:"Estadio", default:"clasico", options:Object.entries(STADIUMS).map(([k,s])=>({value:k,label:s.name})) },
      { type:"select", key:"per", label:"Jugadores por equipo", default:"1", options:[{value:"1",label:"1 vs 1"},{value:"2",label:"2 vs 2"},{value:"3",label:"3 vs 3"}] },
      { type:"select", key:"win", label:"Goles para ganar", default:"5", options:[{value:"3",label:"3"},{value:"5",label:"5"},{value:"10",label:"10"}] },
      { type:"select", key:"ai", label:"Dificultad IA", default:"normal", options:[{value:"facil",label:"Fácil"},{value:"normal",label:"Normal"},{value:"dificil",label:"Difícil"}] },
    ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Mover", value:"WASD / flechas" }, { type:"keys", label:"Patear", value:"Espacio" }, { type:"keys", label:"Pausa", value:"P" } ]},
  ]});
  document.addEventListener("nova-theme-change", ()=>{ if(ball)draw(); });
  newGame(); draw();
})();
