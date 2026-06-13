/* Jump Quest — NOVA ARCADE. Plataformas 2D tipo Mario. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const coinsEl = document.getElementById("coins"), livesEl = document.getElementById("lives"), lvlEl = document.getElementById("lvl");
  const T = 32, VW = cv.width, VH = cv.height;

  // niveles (tilemap). '#'=bloque '='=plataforma 'o'=moneda 'E'=enemigo '^'=pincho 'P'=inicio 'F'=meta
  const LEVELS = [
    [
      "                                                            F",
      "                                                          ###",
      "                              o o                       ===  ",
      "                  o          ===            o o              ",
      "          o     ====               E      ====      E        ",
      "   P     ===              ^^            o                    ",
      "###############     #########   ##############     ##########",
      "###############     #########   ##############     ##########",
    ],
    [
      "                              o o o                         F",
      "              o            =========          o o o      ####",
      "      o     ===     E                  ===   =======         ",
      "    ====          ====     o o     E        E         E      ",
      "  P        ^^^          ====    ====================         ",
      "######   ########   ###      ###              ###    #######",
      "######   ########   ###  ^^  ###      ^^^     ###    #######",
      "######   ########   ###############################  #######",
    ],
  ];

  let cfg = Object.assign({ diff:"normal", glow:true }, NovaSettings.loadCfg("platform"));
  const ESPD = { facil:0.6, normal:0.9, dificil:1.3 };
  let map, mapW, mapH, player, enemies, coins, goal, cam, coinCount, lives, lvl, state="idle", raf=null, last=0, keys={};

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function loadLevel(n){
    const L=LEVELS[n%LEVELS.length]; mapH=L.length; mapW=Math.max(...L.map(r=>r.length));
    map=L.map(r=>r.padEnd(mapW," ").split(""));
    enemies=[]; coins=[]; goal=null; player=null;
    for(let y=0;y<mapH;y++)for(let x=0;x<mapW;x++){ const c=map[y][x];
      if(c==="P"){ player={x:x*T,y:y*T,w:24,h:30,vx:0,vy:0,grounded:false}; map[y][x]=" "; }
      else if(c==="E"){ enemies.push({x:x*T+4,y:y*T+T-26,w:24,h:24,vx:-ESPD[cfg.diff],alive:true}); map[y][x]=" "; }
      else if(c==="o"){ coins.push({x:x*T+T/2,y:y*T+T/2,got:false}); map[y][x]=" "; }
      else if(c==="F"){ goal={x:x*T,y:y*T}; map[y][x]=" "; }
    }
    if(!player) player={x:T,y:T,w:24,h:30,vx:0,vy:0,grounded:false};
    cam=0;
  }
  function solid(x,y){ const c=tileAt(x,y); return c==="#"||c==="="; }
  function tileAt(px,py){ const tx=Math.floor(px/T), ty=Math.floor(py/T); if(tx<0||ty<0||tx>=mapW||ty>=mapH) return ty>=mapH?"#":" "; return map[ty][tx]; }
  function hazard(x,y){ return tileAt(x,y)==="^"; }

  function newGame(){ coinCount=0; lives=3; lvl=0; loadLevel(0); updateHUD(); }
  function updateHUD(){ coinsEl.textContent=coinCount; livesEl.textContent=lives; lvlEl.textContent=lvl+1; }
  function start(){ if(state==="play")return; if(state!=="pause") { if(!player) newGame(); } state="play"; ov.classList.remove("show"); NovaAudio.resume(); if(!NovaAudio.isMusicOn()&&!NovaAudio.get().muteMusic) NovaAudio.startMusic("chip",118); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(frame); }
  function frame(now){ const dt=Math.min(40,now-last)/16.7; last=now; if(state!=="play")return; step(dt); draw(); raf=requestAnimationFrame(frame); }

  function step(dt){
    const p=player, SP=2.6, JUMP=-9.6, G=0.55;
    if(keys.left) p.vx=-SP; else if(keys.right) p.vx=SP; else p.vx*=0.7;
    if((keys.jump)&&p.grounded){ p.vy=JUMP; p.grounded=false; NovaAudio.play("rotate"); }
    p.vy=Math.min(p.vy+G*dt, 12);
    // mover X
    p.x+=p.vx*dt; collideX(p);
    // mover Y
    p.y+=p.vy*dt; collideY(p);
    // caída al vacío
    if(p.y>mapH*T+40) return die();
    // pinchos
    if(hazard(p.x+p.w/2,p.y+p.h-2)) return die();
    // enemigos
    enemies.forEach(e=>{ if(!e.alive)return; e.x+=e.vx*dt;
      // girar en bordes/paredes
      if(solid(e.x,e.y+e.h+2)===false || solid(e.x+e.w,e.y+e.h+2)===false){ } // (simplificado: rebota en paredes)
      if(solid(e.x-1,e.y+e.h/2)||(e.vx<0&&!solid(e.x-1,e.y+e.h+2))) e.vx=Math.abs(e.vx);
      if(solid(e.x+e.w+1,e.y+e.h/2)||(e.vx>0&&!solid(e.x+e.w+1,e.y+e.h+2))) e.vx=-Math.abs(e.vx);
      // colisión con jugador
      if(aabb(p,e)){ if(p.vy>1 && p.y+p.h-e.y < 16){ e.alive=false; p.vy=JUMP*0.6; coinCount+=1; updateHUD(); NovaAudio.play("eat"); } else return die(); }
    });
    // monedas
    coins.forEach(c=>{ if(!c.got && Math.abs((p.x+p.w/2)-c.x)<18 && Math.abs((p.y+p.h/2)-c.y)<20){ c.got=true; coinCount++; updateHUD(); NovaAudio.play("point"); } });
    // meta
    if(goal && p.x+p.w>goal.x && p.y<goal.y+T*2 && p.y+p.h>goal.y-T){ return levelClear(); }
    // cámara
    cam=Math.max(0, Math.min(mapW*T-VW, p.x - VW*0.4));
  }
  function collideX(p){ if(p.vx>0){ if(solid(p.x+p.w,p.y+2)||solid(p.x+p.w,p.y+p.h-2)){ p.x=Math.floor((p.x+p.w)/T)*T-p.w-0.1; p.vx=0; } } else if(p.vx<0){ if(solid(p.x,p.y+2)||solid(p.x,p.y+p.h-2)){ p.x=(Math.floor(p.x/T)+1)*T+0.1; p.vx=0; } } }
  function collideY(p){ p.grounded=false; if(p.vy>0){ if(solid(p.x+2,p.y+p.h)||solid(p.x+p.w-2,p.y+p.h)){ p.y=Math.floor((p.y+p.h)/T)*T-p.h-0.1; p.vy=0; p.grounded=true; } } else if(p.vy<0){ if(solid(p.x+2,p.y)||solid(p.x+p.w-2,p.y)){ p.y=(Math.floor(p.y/T)+1)*T+0.1; p.vy=0; } } }
  function aabb(a,b){ return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y; }
  function die(){ lives--; updateHUD(); NovaAudio.play("hit"); if(lives<=0) return over(); loadLevel(lvl); }
  function over(){ state="over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); NovaAudio.play("over"); ovTitle.textContent="GAME OVER"; ovTitle.className="lose"; ovMsg.textContent=`Monedas: ${coinCount}`; ovBtn.textContent="↻ Reintentar"; ov.classList.add("show"); }
  function levelClear(){ NovaAudio.play("win"); lvl++; if(lvl>=LEVELS.length){ state="over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); ovTitle.textContent="¡COMPLETADO!"; ovTitle.className="win"; ovMsg.textContent=`Todos los niveles · ${coinCount} monedas`; ovBtn.textContent="↻ Jugar de nuevo"; ov.classList.add("show"); lvl=0; player=null; return; } updateHUD(); loadLevel(lvl); }

  function draw(){
    // cielo degradado
    const g=ctx.createLinearGradient(0,0,0,VH); g.addColorStop(0,css("--bg")); g.addColorStop(1,css("--bg-2")); ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
    const x0=Math.floor(cam/T);
    for(let ty=0;ty<mapH;ty++)for(let tx=x0;tx<x0+VW/T+2&&tx<mapW;tx++){ const c=map[ty][tx]; const sx=tx*T-cam, sy=ty*T;
      if(c==="#"){ ctx.fillStyle=css("--surface-2"); ctx.fillRect(sx,sy,T,T); ctx.strokeStyle=css("--accent"); ctx.globalAlpha=cfg.glow?.5:.3; ctx.lineWidth=1; ctx.strokeRect(sx+1,sy+1,T-2,T-2); ctx.globalAlpha=1; }
      else if(c==="="){ ctx.fillStyle=css("--surface-solid"); ctx.fillRect(sx,sy+6,T,T-12); ctx.fillStyle=css("--accent-3"); ctx.fillRect(sx,sy+6,T,3); }
      else if(c==="^"){ ctx.fillStyle=css("--accent-2"); ctx.beginPath(); ctx.moveTo(sx,sy+T); ctx.lineTo(sx+T/2,sy+8); ctx.lineTo(sx+T,sy+T); ctx.fill(); }
    }
    // meta (bandera)
    if(goal){ const sx=goal.x-cam; ctx.strokeStyle=css("--text-dim"); ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(sx+8,goal.y-T); ctx.lineTo(sx+8,goal.y+2*T); ctx.stroke(); ctx.fillStyle=css("--accent-3"); if(cfg.glow){ctx.shadowColor=css("--accent-3");ctx.shadowBlur=12;} ctx.beginPath(); ctx.moveTo(sx+8,goal.y-T); ctx.lineTo(sx+34,goal.y-T+10); ctx.lineTo(sx+8,goal.y-T+20); ctx.fill(); ctx.shadowBlur=0; }
    // monedas
    coins.forEach(c=>{ if(c.got)return; const sx=c.x-cam; if(sx<-20||sx>VW+20)return; ctx.fillStyle=css("--accent-3"); if(cfg.glow){ctx.shadowColor=css("--accent-3");ctx.shadowBlur=10;} ctx.beginPath(); ctx.arc(sx,c.y,8,0,7); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle="rgba(0,0,0,.3)"; ctx.fillRect(sx-2,c.y-5,4,10); });
    // enemigos
    enemies.forEach(e=>{ if(!e.alive)return; const sx=e.x-cam; if(sx<-40||sx>VW+40)return; ctx.fillStyle=css("--accent-2"); if(cfg.glow){ctx.shadowColor=css("--accent-2");ctx.shadowBlur=8;} ctx.beginPath(); ctx.roundRect(sx,e.y,e.w,e.h,6); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(sx+8,e.y+9,3,0,7); ctx.arc(sx+16,e.y+9,3,0,7); ctx.fill(); });
    // jugador
    const p=player, px=p.x-cam; ctx.fillStyle=css("--accent"); if(cfg.glow){ctx.shadowColor=css("--accent");ctx.shadowBlur=12;} ctx.beginPath(); ctx.roundRect(px,p.y,p.w,p.h,6); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle="#06060c"; ctx.fillRect(px+ (p.vx>=0?14:4), p.y+8, 6,4);
  }

  const km={ArrowLeft:"left",ArrowRight:"right",a:"left",d:"right",A:"left",D:"right",ArrowUp:"jump",w:"jump",W:"jump"," ":"jump"};
  document.addEventListener("keydown",e=>{ const k=km[e.key]; if(k){ e.preventDefault(); keys[k]=true; if(state==="idle"||state==="over"){ if(state==="over"){player=null;} start(); } } });
  document.addEventListener("keyup",e=>{ const k=km[e.key]; if(k) keys[k]=false; });
  document.querySelectorAll("#dpad button").forEach(b=>{ const k=b.dataset.k; const on=()=>{keys[k]=true; if(state==="idle"||state==="over"){if(state==="over")player=null; start();}}; const off=()=>keys[k]=false; b.addEventListener("touchstart",e=>{e.preventDefault();on();},{passive:false}); b.addEventListener("touchend",e=>{e.preventDefault();off();}); b.addEventListener("mousedown",on); b.addEventListener("mouseup",off); b.addEventListener("mouseleave",off); });

  ovBtn.onclick=()=>{ if(state==="over"){ newGame(); } start(); };
  document.getElementById("restart").onclick=()=>{ state="over"; newGame(); start(); };

  NovaSettings.mount({ gameId:"platform", onChange:()=>{}, extra:[
    { title:"Juego", rows:[ { type:"select", key:"diff", label:"Dificultad", default:"normal", options:[{value:"facil",label:"Fácil"},{value:"normal",label:"Normal"},{value:"dificil",label:"Difícil"}] } ]},
    { title:"Gráficos", rows:[ { type:"toggle", key:"glow", label:"Brillo neón", default:true } ]},
    { title:"Controles", rows:[ { type:"keys", label:"Mover", value:"← → / A D" }, { type:"keys", label:"Saltar", value:"Espacio / ↑ / W" } ]},
  ]});
  newGame(); draw();
})();
