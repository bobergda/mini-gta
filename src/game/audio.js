function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createAudioSystem(windowRef) {
  const AudioContextRef = windowRef.AudioContext || windowRef.webkitAudioContext;
  if (!AudioContextRef) {
    return {
      start() {
        return false;
      },
      update() {},
    };
  }

  let context = null;
  let masterGain = null;
  let started = false;
  let lastHealth = 100;
  let lastCash = 0;
  let lastWanted = 0;
  let lastGameOver = false;
  let projectileIds = new Set();
  const cooldowns = new Map();

  let engineOsc = null;
  let engineGain = null;

  function ensureContext() {
    if (context) return true;

    try {
      context = new AudioContextRef();
      masterGain = context.createGain();
      masterGain.gain.value = 0.22;
      masterGain.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function now() {
    return context.currentTime;
  }

  function allowEvent(name, interval) {
    const timestamp = now();
    const nextAllowed = cooldowns.get(name) ?? 0;
    if (timestamp < nextAllowed) return false;
    cooldowns.set(name, timestamp + interval);
    return true;
  }

  function playTone({
    frequency,
    duration = 0.08,
    type = "square",
    gain = 0.12,
    attack = 0.003,
    release = 0.08,
    detune = 0,
    endFrequency = null,
  }) {
    if (!context || !masterGain) return;

    const timestamp = now();
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, timestamp);
    oscillator.detune.setValueAtTime(detune, timestamp);
    if (typeof endFrequency === "number") {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        timestamp + duration,
      );
    }

    envelope.gain.setValueAtTime(0.0001, timestamp);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), timestamp + attack);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      timestamp + Math.max(duration, attack + release),
    );

    oscillator.connect(envelope);
    envelope.connect(masterGain);

    oscillator.start(timestamp);
    oscillator.stop(timestamp + Math.max(duration, attack + release) + 0.01);
  }

  function playNoise({ duration = 0.06, gain = 0.08 }) {
    if (!context || !masterGain) return;

    const sampleRate = context.sampleRate;
    const size = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = context.createBuffer(1, size, sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < size; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / size);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const timestamp = now();

    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, timestamp);
    filter.Q.setValueAtTime(0.85, timestamp);

    envelope.gain.setValueAtTime(0.0001, timestamp);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), timestamp + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, timestamp + duration + 0.02);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);
    source.start(timestamp);
    source.stop(timestamp + duration + 0.03);
  }

  function playPlayerShot() {
    playNoise({ duration: 0.04, gain: 0.07 });
    playTone({
      frequency: 980,
      endFrequency: 560,
      duration: 0.08,
      type: "square",
      gain: 0.08,
      release: 0.09,
    });
  }

  function playEnemyShot() {
    playNoise({ duration: 0.05, gain: 0.06 });
    playTone({
      frequency: 420,
      endFrequency: 280,
      duration: 0.1,
      type: "sawtooth",
      gain: 0.05,
      release: 0.1,
    });
  }

  function playPickup() {
    playTone({ frequency: 760, duration: 0.09, type: "triangle", gain: 0.06 });
    playTone({ frequency: 1120, duration: 0.12, type: "triangle", gain: 0.05, attack: 0.01 });
  }

  function playDamage() {
    playNoise({ duration: 0.06, gain: 0.09 });
    playTone({
      frequency: 210,
      endFrequency: 120,
      duration: 0.12,
      type: "square",
      gain: 0.06,
      release: 0.14,
    });
  }

  function playWantedUp() {
    playTone({ frequency: 540, duration: 0.11, type: "sine", gain: 0.05 });
    playTone({ frequency: 760, duration: 0.13, type: "sine", gain: 0.05, attack: 0.01 });
  }

  function playGameOver() {
    playTone({
      frequency: 220,
      endFrequency: 85,
      duration: 0.55,
      type: "sawtooth",
      gain: 0.08,
      release: 0.5,
    });
  }

  function ensureEngineLoop() {
    if (!context || !masterGain) return;
    if (engineOsc && engineGain) return;

    engineOsc = context.createOscillator();
    engineGain = context.createGain();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.setValueAtTime(55, now());
    engineGain.gain.setValueAtTime(0.0001, now());
    engineOsc.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start();
  }

  function updateEngine(state) {
    if (!context || !started) return;
    ensureEngineLoop();
    if (!engineOsc || !engineGain) return;

    const timestamp = now();
    const inVehicle = state.player.mode === "vehicle" && !state.gameOver;
    const speed = Math.abs(state.player.speed || 0);
    const targetFreq = inVehicle ? 52 + clamp(speed, 0, 45) * 4.3 : 45;
    const targetGain = inVehicle ? 0.018 + clamp(speed / 45, 0, 1) * 0.06 : 0.0001;

    engineOsc.frequency.setTargetAtTime(targetFreq, timestamp, 0.03);
    engineGain.gain.setTargetAtTime(targetGain, timestamp, inVehicle ? 0.04 : 0.09);
  }

  function start(state = null) {
    if (!ensureContext()) return false;
    context.resume?.();
    started = true;

    if (state) {
      lastHealth = state.player.health;
      lastCash = state.player.cash;
      lastWanted = state.player.wanted;
      lastGameOver = state.gameOver;
      projectileIds = new Set((state.projectiles ?? []).map((projectile) => projectile.id));
    }

    return true;
  }

  function update(state) {
    if (!started || !context || context.state !== "running") return;

    const currentProjectiles = new Set();
    for (const projectile of state.projectiles ?? []) {
      currentProjectiles.add(projectile.id);
      if (projectileIds.has(projectile.id)) continue;

      if (projectile.owner === "player") {
        if (allowEvent("player-shot", 0.03)) {
          playPlayerShot();
        }
      } else if (allowEvent("npc-shot", 0.05)) {
        playEnemyShot();
      }
    }
    projectileIds = currentProjectiles;

    if (state.player.cash > lastCash && allowEvent("pickup", 0.03)) {
      playPickup();
    }

    if (state.player.health < lastHealth - 0.01 && allowEvent("damage", 0.08)) {
      playDamage();
    }

    if (state.player.wanted > lastWanted && allowEvent("wanted-up", 0.2)) {
      playWantedUp();
    }

    if (state.gameOver && !lastGameOver) {
      playGameOver();
    }

    updateEngine(state);

    lastHealth = state.player.health;
    lastCash = state.player.cash;
    lastWanted = state.player.wanted;
    lastGameOver = state.gameOver;
  }

  return {
    start,
    update,
  };
}
