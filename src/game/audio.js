function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createNoiseBuffer(context, durationSeconds = 1.2) {
  const size = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, size, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < size; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function createImpulseBuffer(context, durationSeconds = 0.45, decay = 4.4) {
  const size = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(2, size, context.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < size; index += 1) {
      const t = index / size;
      const envelope = Math.pow(1 - t, decay);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return buffer;
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
  let started = false;

  let masterGain = null;
  let mixBus = null;
  let sfxBus = null;
  let engineBus = null;
  let ambientBus = null;
  let reverbSend = null;
  let noiseBuffer = null;

  let engineNodes = null;
  let ambienceNodes = null;
  let sirenNodes = null;

  let lastHealth = 100;
  let lastCash = 0;
  let lastWanted = 0;
  let lastGameOver = false;
  let lastVehicleSpeed = 0;
  let projectileIds = new Set();

  const cooldowns = new Map();
  let engineRpm = 0.2;

  function ensureContext() {
    if (context) return true;

    try {
      context = new AudioContextRef();
      noiseBuffer = createNoiseBuffer(context, 1.5);

      mixBus = context.createGain();
      mixBus.gain.value = 0.95;

      sfxBus = context.createGain();
      sfxBus.gain.value = 0.95;

      engineBus = context.createGain();
      engineBus.gain.value = 0.85;

      ambientBus = context.createGain();
      ambientBus.gain.value = 0.65;

      reverbSend = context.createGain();
      reverbSend.gain.value = 0.25;

      const reverb = context.createConvolver();
      reverb.buffer = createImpulseBuffer(context);
      const reverbReturn = context.createGain();
      reverbReturn.gain.value = 0.5;

      const lowShelf = context.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 180;
      lowShelf.gain.value = 2.8;

      const highShelf = context.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 3200;
      highShelf.gain.value = 1.9;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -25;
      compressor.knee.value = 16;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.14;

      masterGain = context.createGain();
      masterGain.gain.value = 0.24;

      sfxBus.connect(mixBus);
      engineBus.connect(mixBus);
      ambientBus.connect(mixBus);

      sfxBus.connect(reverbSend);
      reverbSend.connect(reverb);
      reverb.connect(reverbReturn);
      reverbReturn.connect(mixBus);

      mixBus.connect(lowShelf);
      lowShelf.connect(highShelf);
      highShelf.connect(compressor);
      compressor.connect(masterGain);
      masterGain.connect(context.destination);

      buildEngineLoop();
      buildAmbienceLoop();
      buildSirenLoop();

      return true;
    } catch {
      return false;
    }
  }

  function now() {
    return context.currentTime;
  }

  function smoothParam(param, value, speed = 0.04) {
    param.setTargetAtTime(value, now(), speed);
  }

  function allowEvent(name, interval) {
    const time = now();
    const next = cooldowns.get(name) ?? 0;
    if (time < next) return false;
    cooldowns.set(name, time + interval);
    return true;
  }

  function connectWithPan(sourceNode, outputNode, pan = 0) {
    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      sourceNode.connect(panner);
      panner.connect(outputNode);
      return;
    }

    sourceNode.connect(outputNode);
  }

  function createEnvelope({ attack = 0.003, hold = 0.04, release = 0.09, gain = 0.12 }) {
    const envelope = context.createGain();
    const t0 = now();
    envelope.gain.setValueAtTime(0.0001, t0);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, gain * 0.75),
      t0 + attack + hold,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    return envelope;
  }

  function playTone({
    frequency,
    endFrequency = null,
    type = "sawtooth",
    gain = 0.11,
    duration = 0.09,
    attack = 0.002,
    release = 0.08,
    detune = 0,
    pan = 0,
    filterType = null,
    filterFrequency = 1400,
    filterQ = 0.8,
    output = sfxBus,
  }) {
    if (!context || !output) return;

    const t0 = now();
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), t0);
    oscillator.detune.setValueAtTime(detune, t0);

    if (typeof endFrequency === "number") {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t0 + duration);
    }

    const envelope = createEnvelope({
      attack,
      hold: Math.max(0, duration - attack),
      release,
      gain,
    });

    if (filterType) {
      const filter = context.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFrequency, t0);
      filter.Q.setValueAtTime(filterQ, t0);
      oscillator.connect(filter);
      filter.connect(envelope);
    } else {
      oscillator.connect(envelope);
    }

    connectWithPan(envelope, output, pan);

    oscillator.start(t0);
    oscillator.stop(t0 + duration + release + 0.03);
  }

  function playNoise({
    duration = 0.08,
    gain = 0.09,
    pan = 0,
    filterType = "bandpass",
    filterFrequency = 1200,
    filterQ = 0.8,
    output = sfxBus,
  }) {
    if (!context || !noiseBuffer || !output) return;

    const t0 = now();
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, t0);
    filter.Q.setValueAtTime(filterQ, t0);

    const envelope = createEnvelope({
      attack: 0.001,
      hold: duration * 0.68,
      release: 0.05,
      gain,
    });

    source.connect(filter);
    filter.connect(envelope);
    connectWithPan(envelope, output, pan);

    source.start(t0);
    source.stop(t0 + duration + 0.07);
  }

  function buildEngineLoop() {
    if (!context || engineNodes) return;

    const baseOsc = context.createOscillator();
    baseOsc.type = "sawtooth";

    const bodyOsc = context.createOscillator();
    bodyOsc.type = "triangle";

    const whineOsc = context.createOscillator();
    whineOsc.type = "square";

    const baseGain = context.createGain();
    baseGain.gain.value = 0.0001;
    const bodyGain = context.createGain();
    bodyGain.gain.value = 0.0001;
    const whineGain = context.createGain();
    whineGain.gain.value = 0.0001;

    const preFilter = context.createBiquadFilter();
    preFilter.type = "lowpass";
    preFilter.frequency.value = 520;

    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = "bandpass";
    bodyFilter.frequency.value = 980;
    bodyFilter.Q.value = 0.8;

    const whineFilter = context.createBiquadFilter();
    whineFilter.type = "bandpass";
    whineFilter.frequency.value = 2100;
    whineFilter.Q.value = 1.1;

    const drive = context.createWaveShaper();
    drive.curve = new Float32Array(1024);
    for (let index = 0; index < drive.curve.length; index += 1) {
      const x = (index / (drive.curve.length - 1)) * 2 - 1;
      drive.curve[index] = Math.tanh(x * 1.8);
    }
    drive.oversample = "2x";

    const postGain = context.createGain();
    postGain.gain.value = 0.46;

    baseOsc.connect(preFilter);
    preFilter.connect(baseGain);

    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);

    whineOsc.connect(whineFilter);
    whineFilter.connect(whineGain);

    baseGain.connect(drive);
    bodyGain.connect(drive);
    whineGain.connect(drive);
    drive.connect(postGain);
    postGain.connect(engineBus);

    const roadNoiseSource = context.createBufferSource();
    roadNoiseSource.buffer = noiseBuffer;
    roadNoiseSource.loop = true;
    const roadNoiseFilter = context.createBiquadFilter();
    roadNoiseFilter.type = "highpass";
    roadNoiseFilter.frequency.value = 500;
    const roadNoiseGain = context.createGain();
    roadNoiseGain.gain.value = 0.0001;
    roadNoiseSource.connect(roadNoiseFilter);
    roadNoiseFilter.connect(roadNoiseGain);
    roadNoiseGain.connect(engineBus);

    const skidNoiseSource = context.createBufferSource();
    skidNoiseSource.buffer = noiseBuffer;
    skidNoiseSource.loop = true;
    const skidFilter = context.createBiquadFilter();
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 1700;
    skidFilter.Q.value = 1.15;
    const skidGain = context.createGain();
    skidGain.gain.value = 0.0001;
    skidNoiseSource.connect(skidFilter);
    skidFilter.connect(skidGain);
    skidGain.connect(engineBus);

    baseOsc.start();
    bodyOsc.start();
    whineOsc.start();
    roadNoiseSource.start();
    skidNoiseSource.start();

    engineNodes = {
      baseOsc,
      bodyOsc,
      whineOsc,
      baseGain,
      bodyGain,
      whineGain,
      preFilter,
      bodyFilter,
      whineFilter,
      roadNoiseGain,
      skidGain,
    };
  }

  function buildAmbienceLoop() {
    if (!context || ambienceNodes) return;

    const lowHum = context.createOscillator();
    lowHum.type = "sine";
    lowHum.frequency.value = 82;

    const lowHumGain = context.createGain();
    lowHumGain.gain.value = 0.0001;

    const cityNoise = context.createBufferSource();
    cityNoise.buffer = noiseBuffer;
    cityNoise.loop = true;
    const cityBand = context.createBiquadFilter();
    cityBand.type = "bandpass";
    cityBand.frequency.value = 720;
    cityBand.Q.value = 0.35;
    const cityNoiseGain = context.createGain();
    cityNoiseGain.gain.value = 0.0001;

    lowHum.connect(lowHumGain);
    lowHumGain.connect(ambientBus);

    cityNoise.connect(cityBand);
    cityBand.connect(cityNoiseGain);
    cityNoiseGain.connect(ambientBus);

    lowHum.start();
    cityNoise.start();

    ambienceNodes = {
      lowHum,
      lowHumGain,
      cityNoiseGain,
    };
  }

  function buildSirenLoop() {
    if (!context || sirenNodes) return;

    const toneA = context.createOscillator();
    toneA.type = "triangle";
    const toneB = context.createOscillator();
    toneB.type = "sine";

    const gainA = context.createGain();
    gainA.gain.value = 0.0001;
    const gainB = context.createGain();
    gainB.gain.value = 0.0001;

    const filterA = context.createBiquadFilter();
    filterA.type = "bandpass";
    filterA.frequency.value = 1200;
    filterA.Q.value = 0.8;

    const filterB = context.createBiquadFilter();
    filterB.type = "bandpass";
    filterB.frequency.value = 720;
    filterB.Q.value = 0.6;

    toneA.connect(filterA);
    filterA.connect(gainA);
    gainA.connect(ambientBus);

    toneB.connect(filterB);
    filterB.connect(gainB);
    gainB.connect(ambientBus);

    toneA.start();
    toneB.start();

    sirenNodes = {
      toneA,
      toneB,
      gainA,
      gainB,
    };
  }

  function playPlayerShot() {
    const pan = randomBetween(-0.18, 0.18);
    playNoise({
      duration: 0.08,
      gain: 0.15,
      pan,
      filterType: "highpass",
      filterFrequency: 1500,
      filterQ: 0.92,
    });

    playTone({
      frequency: 190,
      endFrequency: 58,
      type: "triangle",
      duration: 0.11,
      gain: 0.13,
      release: 0.14,
      pan,
      filterType: "lowpass",
      filterFrequency: 820,
      filterQ: 0.72,
    });

    playTone({
      frequency: 2600,
      endFrequency: 980,
      type: "square",
      duration: 0.05,
      attack: 0.0008,
      gain: 0.05,
      release: 0.05,
      pan,
      filterType: "bandpass",
      filterFrequency: 2200,
      filterQ: 1.2,
    });
  }

  function playEnemyShot() {
    const pan = randomBetween(-0.5, 0.5);
    playNoise({
      duration: 0.07,
      gain: 0.11,
      pan,
      filterType: "bandpass",
      filterFrequency: 1300,
      filterQ: 1.0,
    });

    playTone({
      frequency: 145,
      endFrequency: 62,
      type: "sawtooth",
      duration: 0.095,
      gain: 0.09,
      release: 0.11,
      pan,
      filterType: "lowpass",
      filterFrequency: 670,
      filterQ: 0.74,
    });
  }

  function playPickup() {
    playTone({
      frequency: 760,
      endFrequency: 900,
      type: "triangle",
      duration: 0.09,
      gain: 0.055,
      release: 0.09,
      filterType: "highpass",
      filterFrequency: 500,
      filterQ: 0.4,
    });
    playTone({
      frequency: 1080,
      endFrequency: 1280,
      type: "triangle",
      duration: 0.1,
      gain: 0.052,
      release: 0.11,
      filterType: "highpass",
      filterFrequency: 700,
      filterQ: 0.4,
    });
    playTone({
      frequency: 1420,
      endFrequency: 1670,
      type: "triangle",
      duration: 0.12,
      gain: 0.05,
      release: 0.12,
      filterType: "highpass",
      filterFrequency: 900,
      filterQ: 0.35,
    });
  }

  function playDamage() {
    playNoise({
      duration: 0.09,
      gain: 0.12,
      filterType: "lowpass",
      filterFrequency: 950,
      filterQ: 0.8,
    });

    playTone({
      frequency: 210,
      endFrequency: 80,
      type: "square",
      duration: 0.15,
      gain: 0.09,
      release: 0.17,
      filterType: "bandpass",
      filterFrequency: 420,
      filterQ: 0.95,
    });
  }

  function playWantedUp() {
    playTone({ frequency: 540, endFrequency: 660, type: "sine", duration: 0.11, gain: 0.055, release: 0.1 });
    playTone({ frequency: 740, endFrequency: 860, type: "sine", duration: 0.12, gain: 0.058, release: 0.12 });
    playTone({ frequency: 610, endFrequency: 710, type: "sine", duration: 0.1, gain: 0.05, release: 0.1 });
  }

  function playGameOver() {
    playNoise({
      duration: 0.17,
      gain: 0.09,
      filterType: "lowpass",
      filterFrequency: 620,
      filterQ: 0.65,
    });

    playTone({
      frequency: 240,
      endFrequency: 74,
      type: "sawtooth",
      duration: 0.64,
      gain: 0.11,
      release: 0.62,
      filterType: "lowpass",
      filterFrequency: 560,
      filterQ: 0.72,
    });
  }

  function updateEngineAndAmbience(state) {
    if (!engineNodes || !ambienceNodes || !sirenNodes) return;

    const inVehicle = state.player.mode === "vehicle" && !state.gameOver;
    const speed = clamp(Math.abs(state.player.speed || 0), 0, 58);
    const speedNorm = speed / 58;

    const speedDelta = speed - lastVehicleSpeed;
    lastVehicleSpeed = speed;
    const accel = clamp(speedDelta * 0.22, -1, 1);

    const gearSteps = [0, 8, 18, 32, 46, 58];
    let gear = 1;
    while (gear < gearSteps.length - 1 && speed > gearSteps[gear]) {
      gear += 1;
    }
    const low = gearSteps[Math.max(0, gear - 1)];
    const high = gearSteps[Math.min(gearSteps.length - 1, gear)];
    const gearRatio = high > low ? (speed - low) / (high - low) : 0;

    const baseRpm = 0.24 + gear * 0.13 + gearRatio * 0.25;
    const throttleBoost = accel > 0 ? accel * 0.16 : accel * 0.05;
    const rpmTarget = clamp(baseRpm + throttleBoost, 0.2, 1.15);
    const rpmSmoothing = inVehicle ? 0.04 : 0.09;
    engineRpm += (rpmTarget - engineRpm) * clamp((1 / rpmSmoothing) * (1 / 60), 0.02, 0.35);

    const steer = inVehicle
      ? Math.abs(
          state.vehicles.find((vehicle) => vehicle.id === state.player.vehicleId)?.steerInput ?? 0,
        )
      : 0;

    const baseFreq = inVehicle ? 52 + engineRpm * 102 : 42;
    const bodyFreq = inVehicle ? 98 + engineRpm * 225 : 90;
    const whineFreq = inVehicle ? 320 + engineRpm * 1450 : 240;
    const cutoff = inVehicle ? 620 + engineRpm * 2600 : 420;

    const rumbleGain = inVehicle ? 0.024 + speedNorm * 0.035 : 0.0001;
    const bodyGain = inVehicle ? 0.018 + speedNorm * 0.023 : 0.0001;
    const whineGain = inVehicle ? 0.004 + Math.pow(speedNorm, 1.4) * 0.025 : 0.0001;

    const roadNoiseGain = inVehicle ? 0.004 + speedNorm * 0.018 : 0.0001;
    const skid = inVehicle ? clamp((speedNorm - 0.25) * steer * 2.2, 0, 1) : 0;
    const skidGain = 0.0001 + skid * 0.02;

    smoothParam(engineNodes.baseOsc.frequency, baseFreq, 0.035);
    smoothParam(engineNodes.bodyOsc.frequency, bodyFreq, 0.038);
    smoothParam(engineNodes.whineOsc.frequency, whineFreq, 0.04);

    smoothParam(engineNodes.preFilter.frequency, cutoff, 0.05);
    smoothParam(engineNodes.bodyFilter.frequency, 860 + engineRpm * 600, 0.05);
    smoothParam(engineNodes.whineFilter.frequency, 1750 + engineRpm * 1300, 0.05);

    smoothParam(engineNodes.baseGain.gain, rumbleGain, inVehicle ? 0.06 : 0.12);
    smoothParam(engineNodes.bodyGain.gain, bodyGain, inVehicle ? 0.06 : 0.12);
    smoothParam(engineNodes.whineGain.gain, whineGain, inVehicle ? 0.05 : 0.12);
    smoothParam(engineNodes.roadNoiseGain.gain, roadNoiseGain, inVehicle ? 0.08 : 0.13);
    smoothParam(engineNodes.skidGain.gain, skidGain, 0.05);

    const ambientLevel = state.gameOver ? 0.0001 : inVehicle ? 0.0026 : 0.0042;
    smoothParam(ambienceNodes.lowHumGain.gain, ambientLevel, 0.18);
    smoothParam(ambienceNodes.cityNoiseGain.gain, ambientLevel * 1.6, 0.18);

    const wanted = clamp(state.player.wanted || 0, 0, 5);
    const sirenIntensity = wanted / 5;
    const sirenTime = now() * (1.35 + sirenIntensity * 0.85);
    const sweep = Math.sin(sirenTime * Math.PI * 2);

    const sirenBase = 640 + sirenIntensity * 90;
    const sirenRange = 220 + sirenIntensity * 130;

    smoothParam(sirenNodes.toneA.frequency, sirenBase + sweep * sirenRange, 0.03);
    smoothParam(
      sirenNodes.toneB.frequency,
      sirenBase * 0.54 + Math.sin((sirenTime + 0.23) * Math.PI * 2) * (sirenRange * 0.4),
      0.04,
    );

    const sirenGainTarget =
      state.gameOver || wanted === 0
        ? 0.0001
        : 0.006 + sirenIntensity * (inVehicle ? 0.017 : 0.013);
    smoothParam(sirenNodes.gainA.gain, sirenGainTarget, 0.1);
    smoothParam(sirenNodes.gainB.gain, sirenGainTarget * 0.72, 0.1);
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
      lastVehicleSpeed = Math.abs(state.player.speed || 0);
      projectileIds = new Set((state.projectiles ?? []).map((projectile) => projectile.id));
    }

    return true;
  }

  function update(state) {
    if (!started || !context) return;
    if (context.state !== "running") {
      context.resume?.();
      return;
    }

    const currentProjectiles = new Set();
    for (const projectile of state.projectiles ?? []) {
      currentProjectiles.add(projectile.id);
      if (projectileIds.has(projectile.id)) continue;

      if (projectile.owner === "player") {
        if (allowEvent("player-shot", 0.035)) {
          playPlayerShot();
        }
      } else if (allowEvent("npc-shot", 0.045)) {
        playEnemyShot();
      }
    }
    projectileIds = currentProjectiles;

    if (state.player.cash > lastCash && allowEvent("pickup", 0.05)) {
      playPickup();
    }

    if (state.player.health < lastHealth - 0.01 && allowEvent("damage", 0.09)) {
      playDamage();
    }

    if (state.player.wanted > lastWanted && allowEvent("wanted-up", 0.22)) {
      playWantedUp();
    }

    if (state.gameOver && !lastGameOver) {
      playGameOver();
    }

    updateEngineAndAmbience(state);

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

function setAudioParam(param, value, time, smoothing = 0.08) {
  if (!param) return;
  if (typeof param.cancelScheduledValues === "function") {
    param.cancelScheduledValues(time);
  }
  if (typeof param.setTargetAtTime === "function") {
    param.setTargetAtTime(value, time, smoothing);
    return;
  }
  param.value = value;
}

function createLoopingNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function playTone(controller, options) {
  if (!controller.ctx || !controller.output) return;
  const ctx = controller.ctx;
  const startAt = ctx.currentTime + (options.delay ?? 0);
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = options.type ?? "sine";
  oscillator.frequency.value = options.frequency ?? 440;
  if (typeof options.sweepTo === "number") {
    oscillator.frequency.linearRampToValueAtTime(
      options.sweepTo,
      startAt + (options.duration ?? 0.12),
    );
  }

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(
    options.gain ?? 0.12,
    startAt + (options.attack ?? 0.01),
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startAt + (options.duration ?? 0.16),
  );

  oscillator.connect(gain);
  gain.connect(controller.output);
  oscillator.start(startAt);
  oscillator.stop(startAt + (options.duration ?? 0.16) + 0.02);
}

function playNoiseBurst(controller, options = {}) {
  if (!controller.ctx || !controller.output) return;
  const ctx = controller.ctx;
  const source = createLoopingNoise(ctx);
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const startAt = ctx.currentTime + (options.delay ?? 0);
  const duration = options.duration ?? 0.14;

  filter.type = options.filterType ?? "bandpass";
  filter.frequency.value = options.frequency ?? 950;
  filter.Q.value = options.q ?? 0.8;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.08, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(controller.output);
  source.start(startAt);
  source.stop(startAt + duration + 0.03);
}

function ensureGraph(controller) {
  if (controller.ctx) {
    return controller.ctx;
  }

  const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtor) {
    return null;
  }

  const ctx = new AudioCtor();
  const output = ctx.createGain();
  const master = ctx.createGain();
  output.connect(master);
  master.connect(ctx.destination);

  const ambienceSource = createLoopingNoise(ctx);
  const ambienceFilter = ctx.createBiquadFilter();
  const ambienceGain = ctx.createGain();
  ambienceFilter.type = "lowpass";
  ambienceFilter.frequency.value = 620;
  ambienceGain.gain.value = 0.0001;
  ambienceSource.connect(ambienceFilter);
  ambienceFilter.connect(ambienceGain);
  ambienceGain.connect(output);
  ambienceSource.start();

  const skidSource = createLoopingNoise(ctx);
  const skidFilter = ctx.createBiquadFilter();
  const skidGain = ctx.createGain();
  skidFilter.type = "bandpass";
  skidFilter.frequency.value = 1280;
  skidFilter.Q.value = 0.55;
  skidGain.gain.value = 0.0001;
  skidSource.connect(skidFilter);
  skidFilter.connect(skidGain);
  skidGain.connect(output);
  skidSource.start();

  const engineOsc = ctx.createOscillator();
  const engineFilter = ctx.createBiquadFilter();
  const engineGain = ctx.createGain();
  engineOsc.type = "sawtooth";
  engineOsc.frequency.value = 70;
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 360;
  engineGain.gain.value = 0.0001;
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(output);
  engineOsc.start();

  const sirenOsc = ctx.createOscillator();
  const sirenGain = ctx.createGain();
  sirenOsc.type = "triangle";
  sirenOsc.frequency.value = 710;
  sirenGain.gain.value = 0.0001;
  sirenOsc.connect(sirenGain);
  sirenGain.connect(output);
  sirenOsc.start();

  controller.ctx = ctx;
  controller.output = output;
  controller.master = master;
  controller.layers = {
    ambienceGain,
    engineGain,
    engineOsc,
    engineFilter,
    skidGain,
    skidFilter,
    sirenGain,
    sirenOsc,
  };

  master.gain.value = controller.muted ? 0 : 0.92;
  return ctx;
}

export function createAudioController() {
  return {
    ctx: null,
    output: null,
    master: null,
    layers: null,
    muted: false,
    unlocked: false,
    lastImpactAt: null,
  };
}

export function getEngineAudioProfile(speed, steerAmount = 0) {
  const clampedSpeed = Math.max(0, Math.abs(speed));
  const clampedSteer = Math.min(1, Math.abs(steerAmount));

  return {
    frequency: 72 + clampedSpeed * 6.2,
    gain: Math.min(0.19, 0.015 + clampedSpeed * 0.0036),
    filterFrequency: 340 + clampedSpeed * 28 + clampedSteer * 180,
  };
}

export function getSkidAudioLevel(vehicle) {
  if (!vehicle) return 0;
  const braking = Math.abs(vehicle.brakeInput ?? 0);
  const slip = Math.max(0, vehicle.slip ?? 0);
  const speed = Math.abs(vehicle.speed ?? 0);
  return Math.min(0.14, braking * 0.04 + slip * 0.085 + speed * 0.0009);
}

export async function unlockAudio(controller) {
  const ctx = ensureGraph(controller);
  if (!ctx) return false;
  if (typeof ctx.resume === "function") {
    await ctx.resume();
  }
  controller.unlocked = ctx.state !== "suspended";
  return controller.unlocked;
}

export function setMuted(controller, muted) {
  controller.muted = muted;
  if (controller.master?.gain) {
    controller.master.gain.value = muted ? 0 : 0.92;
  }
}

function handleEvent(controller, event) {
  const ctx = controller.ctx;
  if (!ctx || controller.muted) return;

  switch (event.type) {
    case "run_started":
      playTone(controller, { type: "square", frequency: 440, sweepTo: 580, duration: 0.1, gain: 0.06 });
      playTone(controller, {
        type: "triangle",
        frequency: 660,
        sweepTo: 760,
        duration: 0.12,
        gain: 0.05,
        delay: 0.04,
      });
      break;
    case "pickup_collected":
      playTone(controller, { type: "triangle", frequency: 760, sweepTo: 980, duration: 0.13, gain: 0.08 });
      break;
    case "vehicle_entered":
      playTone(controller, { type: "square", frequency: 240, sweepTo: 190, duration: 0.09, gain: 0.055 });
      break;
    case "vehicle_exited":
      playTone(controller, { type: "square", frequency: 190, sweepTo: 260, duration: 0.09, gain: 0.04 });
      break;
    case "wanted_increased":
      playTone(controller, { type: "sawtooth", frequency: 520, sweepTo: 420, duration: 0.16, gain: 0.07 });
      playTone(controller, { type: "triangle", frequency: 660, sweepTo: 780, duration: 0.16, gain: 0.035, delay: 0.02 });
      break;
    case "district_event_started":
      playTone(controller, { type: "sine", frequency: 510, sweepTo: 620, duration: 0.18, gain: 0.05 });
      break;
    case "district_event_completed":
      playTone(controller, { type: "triangle", frequency: 500, sweepTo: 760, duration: 0.22, gain: 0.07 });
      playTone(controller, { type: "triangle", frequency: 760, sweepTo: 980, duration: 0.18, gain: 0.05, delay: 0.05 });
      break;
    case "district_event_failed":
      playTone(controller, { type: "sawtooth", frequency: 300, sweepTo: 180, duration: 0.2, gain: 0.05 });
      break;
    case "damage_taken":
    case "collision_heavy":
      if (controller.lastImpactAt == null || ctx.currentTime - controller.lastImpactAt > 0.16) {
        controller.lastImpactAt = ctx.currentTime;
        playNoiseBurst(controller, { frequency: 920, gain: event.type === "collision_heavy" ? 0.12 : 0.08, duration: 0.16 });
      }
      break;
    case "game_over":
    case "time_up":
      playTone(controller, { type: "sawtooth", frequency: 330, sweepTo: 180, duration: 0.28, gain: 0.085 });
      playTone(controller, { type: "triangle", frequency: 210, sweepTo: 120, duration: 0.34, gain: 0.06, delay: 0.06 });
      break;
    default:
      break;
  }
}

export function syncAudio(controller, state, events = [], dt = 0.016) {
  if (!controller.unlocked || controller.muted) {
    return;
  }

  const ctx = ensureGraph(controller);
  if (!ctx || !controller.layers) {
    return;
  }

  const now = ctx.currentTime;
  const activeVehicle =
    state.player.mode === "vehicle"
      ? state.vehicles.find((vehicle) => vehicle.id === state.player.vehicleId) ?? null
      : null;
  const engineProfile = getEngineAudioProfile(activeVehicle?.speed ?? 0, activeVehicle?.steerInput ?? 0);
  const skidLevel = getSkidAudioLevel(activeVehicle);
  const nearestPolice = state.vehicles.find((vehicle) => vehicle.kind === "police") ?? null;
  const wantedMix = Math.min(1, state.player.wanted / 5);

  setAudioParam(controller.layers.engineOsc.frequency, engineProfile.frequency, now);
  setAudioParam(controller.layers.engineFilter.frequency, engineProfile.filterFrequency, now);
  setAudioParam(controller.layers.engineGain.gain, activeVehicle ? engineProfile.gain : 0.0001, now, 0.06);

  setAudioParam(controller.layers.skidGain.gain, skidLevel || 0.0001, now, 0.04);
  setAudioParam(
    controller.layers.skidFilter.frequency,
    880 + Math.min(520, Math.abs(activeVehicle?.speed ?? 0) * 14),
    now,
    0.04,
  );

  const ambienceGain = state.running && !state.gameOver ? 0.028 + wantedMix * 0.014 + dt * 0.002 : 0.0001;
  setAudioParam(controller.layers.ambienceGain.gain, ambienceGain, now, 0.2);

  if (nearestPolice && state.player.wanted > 0 && !state.gameOver) {
    const sirenFreq = 720 + Math.sin(nearestPolice.sirenPhase) * 145;
    setAudioParam(controller.layers.sirenOsc.frequency, sirenFreq, now, 0.04);
    setAudioParam(controller.layers.sirenGain.gain, 0.018 + wantedMix * 0.045, now, 0.05);
  } else {
    setAudioParam(controller.layers.sirenGain.gain, 0.0001, now, 0.08);
  }

  for (const event of events) {
    handleEvent(controller, event);
  }
}
