/* NOVA ARCADE — gestor de audio (WebAudio, sin archivos).
   Música procedural en loop + efectos sintetizados. Volumen/mute por canal, persistente. */
(function () {
  const KEY = "nova-audio";
  const defaults = { master: 0.7, music: 0.5, sfx: 0.8, muteMusic: false, muteSfx: false };
  let st = Object.assign({}, defaults, load());
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(st)); }

  let ctx = null, masterGain, musicGain, sfxGain, musicTimer = null, step = 0, currentScale = null;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain(); masterGain.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.connect(masterGain);
    sfxGain = ctx.createGain(); sfxGain.connect(masterGain);
    applyGains();
  }
  function applyGains() {
    if (!ctx) return;
    masterGain.gain.value = st.master;
    musicGain.gain.value = st.muteMusic ? 0 : st.music;
    sfxGain.gain.value = st.muteSfx ? 0 : st.sfx;
  }

  // ---- efectos ----
  function blip(freq = 440, dur = 0.08, type = "square", target) {
    ensure(); if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(target || sfxGain); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  const sfx = {
    move:  () => blip(330, 0.05, "square"),
    eat:   () => blip(660, 0.09, "square"),
    rotate:() => blip(440, 0.05, "triangle"),
    drop:  () => blip(180, 0.12, "sawtooth"),
    clear: () => { blip(523,0.1); setTimeout(()=>blip(784,0.12),80); setTimeout(()=>blip(1046,0.16),170); },
    hit:   () => blip(120, 0.2, "sawtooth"),
    point: () => blip(880, 0.1, "square"),
    over:  () => { blip(300,0.18,"sawtooth"); setTimeout(()=>blip(200,0.22,"sawtooth"),140); setTimeout(()=>blip(120,0.3,"sawtooth"),300); },
    win:   () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>blip(f,0.14),i*110)); },
    ui:    () => blip(520, 0.04, "sine"),
  };

  // ---- música procedural (arpegio en loop, escala menor pentatónica) ----
  const SCALES = {
    neon:    [220, 261.6, 293.7, 349.2, 392, 440, 523.3],
    chip:    [196, 233, 261.6, 311, 349, 392, 466],
  };
  function startMusic(scaleName = "neon", bpm = 104) {
    ensure(); if (ctx.state === "suspended") ctx.resume();
    stopMusic(); currentScale = SCALES[scaleName] || SCALES.neon; step = 0;
    const interval = (60 / bpm) * 1000 / 2; // corcheas
    musicTimer = setInterval(() => {
      const sc = currentScale;
      const note = sc[Math.floor(Math.random() * sc.length)] * (Math.random() < 0.25 ? 0.5 : 1);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = note;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
      o.connect(g); g.connect(musicGain); o.start(); o.stop(ctx.currentTime + 0.36);
      // bajo cada 4 pasos
      if (step % 4 === 0) {
        const b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = "sine"; b.frequency.value = sc[0] / 2;
        bg.gain.setValueAtTime(0.0001, ctx.currentTime);
        bg.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.02);
        bg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        b.connect(bg); bg.connect(musicGain); b.start(); b.stop(ctx.currentTime + 0.55);
      }
      step++;
    }, interval);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  window.NovaAudio = {
    sfx,
    play: (name) => { if (sfx[name]) sfx[name](); },
    startMusic, stopMusic,
    resume: () => { ensure(); if (ctx.state === "suspended") ctx.resume(); },
    get: () => Object.assign({}, st),
    set: (k, v) => { st[k] = v; save(); applyGains(); },
    isMusicOn: () => !!musicTimer,
  };
})();
