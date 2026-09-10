import { getNpcVoiceFrequency } from "../content/npcs.js?v=fresh-20260909-2057-b77f1414";

const MASTER_VOLUME = 0.84;
const CHATTER_INTERVAL_SECONDS = 0.055;
const THRUST_TICK_SECONDS = 0.08;

export function createGameAudio() {
  let context = null;
  let master = null;
  let isUnlocked = false;
  let nextChatterAt = 0;
  let nextThrustAt = 0;
  let nextNpcMiningImpactAt = 0;

  function unlock() {
    if (isUnlocked) {
      resumeContext();
      return;
    }

    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return;
    }

    context = new AudioContextConstructor();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);
    isUnlocked = true;
    resumeContext();
    playUiClick();
  }

  function playUiClick() {
    tone({ frequency: 660, duration: 0.035, type: "square", volume: 0.11 });
    tone({ frequency: 990, duration: 0.025, delay: 0.028, type: "square", volume: 0.07 });
  }

  function playPanelDrop() {
    tone({ frequency: 120, endFrequency: 75, duration: 0.055, type: "triangle", volume: 0.07 });
    noiseBurst({ duration: 0.04, volume: 0.045 });
  }

  function playPower(isPowered) {
    if (isPowered) {
      // Short rev-up: this should feel like an old drive catching, not a constant idle.
      tone({ frequency: 62, endFrequency: 150, duration: 0.3, type: "sawtooth", volume: 0.065 });
      tone({ frequency: 130, endFrequency: 330, duration: 0.34, delay: 0.03, type: "triangle", volume: 0.075 });
      brownNoiseBurst({ duration: 0.18, volume: 0.026, delay: 0.04 });
      tone({ frequency: 620, duration: 0.055, delay: 0.31, type: "sine", volume: 0.045 });
      return;
    }

    // Short rev-down: the drive winds out and falls quiet.
    tone({ frequency: 300, endFrequency: 78, duration: 0.3, type: "triangle", volume: 0.075 });
    tone({ frequency: 120, endFrequency: 42, duration: 0.38, delay: 0.04, type: "sawtooth", volume: 0.045 });
    brownNoiseBurst({ duration: 0.18, volume: 0.022, delay: 0.12 });
  }

  function playScanner() {
    tone({ frequency: 880, endFrequency: 1480, duration: 0.16, type: "sine", volume: 0.09 });
    tone({ frequency: 440, duration: 0.08, delay: 0.12, type: "triangle", volume: 0.055 });
  }

  function playMiningShot() {
    tone({ frequency: 160, endFrequency: 90, duration: 0.07, type: "square", volume: 0.12 });
    noiseBurst({ duration: 0.045, volume: 0.08 });
  }

  // The dud a worn mining laser makes when the charge sputters instead of firing.
  function playMinerFault(stage = "degraded") {
    const intensity = stage === "failed" ? 1 : stage === "emergency" ? 0.7 : 0.45;
    tone({ frequency: 120, endFrequency: 55, duration: 0.09, type: "sawtooth", volume: 0.09 * intensity });
    noiseBurst({ duration: 0.06, volume: 0.06 * intensity });
  }

  // The warble a tractor field makes as its grip flickers.
  function playCollectorFault(stage = "degraded") {
    const intensity = stage === "failed" ? 1 : stage === "emergency" ? 0.7 : 0.45;
    tone({ frequency: 340, endFrequency: 180, duration: 0.12, type: "triangle", volume: 0.07 * intensity });
    tone({ frequency: 190, endFrequency: 300, duration: 0.1, delay: 0.05, type: "sine", volume: 0.05 * intensity });
  }

  function playRockBreak(tier = 1, { volumeScale = 1, pitchScale = 1, isNpcMining = false } = {}) {
    if (isNpcMining && isReady()) {
      const now = context.currentTime;
      if (now < nextNpcMiningImpactAt) {
        return;
      }
      // A busy mining field reports as activity, not a stack of identical guns.
      nextNpcMiningImpactAt = now + 0.22;
    }

    const base = tier <= 1 ? 180 : 130;
    const scale = Math.min(1, Math.max(0, volumeScale));
    const pitch = Math.min(1.15, Math.max(0.65, pitchScale));

    tone({ frequency: base * pitch, endFrequency: 70 * pitch, duration: 0.12, type: "square", volume: 0.08 * scale });
    noiseBurst({
      duration: 0.08 + Math.min(0.08, tier * 0.025),
      volume: 0.07 * scale * (0.35 + 0.65 * scale),
    });
  }

  function playPickup(type = "fuel") {
    const first = type === "crystal" ? 760 : 520;
    const second = type === "crystal" ? 1140 : 780;

    tone({ frequency: first, duration: 0.04, type: "square", volume: 0.06 });
    tone({ frequency: second, duration: 0.045, delay: 0.038, type: "square", volume: 0.055 });
  }

  function playHullHit(amount = 10) {
    const weight = Math.min(1, Math.max(0.25, amount / 45));

    tone({ frequency: 82, endFrequency: 46, duration: 0.16 + weight * 0.08, type: "sawtooth", volume: 0.12 * weight });
    noiseBurst({ duration: 0.08 + weight * 0.1, volume: 0.1 * weight });
  }

  function playDock() {
    tone({ frequency: 320, duration: 0.06, type: "triangle", volume: 0.07 });
    tone({ frequency: 480, duration: 0.06, delay: 0.065, type: "triangle", volume: 0.07 });
    tone({ frequency: 640, duration: 0.08, delay: 0.13, type: "triangle", volume: 0.06 });
  }

  function playCargoTransfer(type = "fuel") {
    const frequency = type === "crystal" ? 700 : 420;

    tone({ frequency, duration: 0.035, type: "square", volume: 0.055 });
  }

  function playContractPaid() {
    [520, 660, 880, 1320].forEach((frequency, index) => {
      tone({ frequency, duration: 0.055, delay: index * 0.052, type: "square", volume: 0.055 });
    });
  }

  function playPanelReveal() {
    tone({ frequency: 360, endFrequency: 620, duration: 0.09, type: "triangle", volume: 0.075 });
    tone({ frequency: 900, duration: 0.04, delay: 0.07, type: "square", volume: 0.045 });
  }

  // A module being fastened into the rack.
  //
  // A drill, and only a drill. It had ratchet clicks over the top of the motor
  // and they read as chirps — a bright, chattery UI noise sitting on the one
  // part that actually sounded like a tool. Gone. What is left is the buzz.
  //
  // Low, because this is heavy machinery going into a ship rather than a
  // cordless screwdriver. It climbs, but only a little: enough to say that
  // something is progressing, not enough to sound like it is revving. Then the
  // trigger is released and it spins DOWN — a drill does not stop dead, and
  // the coast is what makes it read as a motor rather than a tone.
  //
  // Built from overlapping segments because `tone` decays across its own
  // duration; one long note would sag away to nothing before the spin-down
  // began, and the two would pump against each other.
  const BOLT_DRIVE_SEGMENTS = 4;
  const BOLT_SEGMENT_STAGGER = 0.13;
  const BOLT_SEGMENT_LENGTH = 0.26;
  // The whole climb, start to let-go. A fifth of an octave, near enough.
  const BOLT_PITCH_LOW = 48;
  const BOLT_PITCH_HIGH = 78;
  // Where the coast ends. Well below the start, so it clearly winds out.
  const BOLT_PITCH_REST = 24;

  function playPanelBolted(delay = 0) {
    const climb = BOLT_PITCH_HIGH - BOLT_PITCH_LOW;

    for (let index = 0; index < BOLT_DRIVE_SEGMENTS; index += 1) {
      const through = index / BOLT_DRIVE_SEGMENTS;
      const next = (index + 1) / BOLT_DRIVE_SEGMENTS;
      const at = delay + index * BOLT_SEGMENT_STAGGER;

      tone({
        frequency: BOLT_PITCH_LOW + climb * through,
        endFrequency: BOLT_PITCH_LOW + climb * next,
        duration: BOLT_SEGMENT_LENGTH,
        delay: at,
        type: "sawtooth",
        volume: 0.075,
      });
      // A detuned partner just above the fundamental. Two saws beating against
      // each other is the difference between a motor and an organ note.
      tone({
        frequency: (BOLT_PITCH_LOW + climb * through) * 2.02,
        endFrequency: (BOLT_PITCH_LOW + climb * next) * 2.02,
        duration: BOLT_SEGMENT_LENGTH,
        delay: at,
        type: "sawtooth",
        volume: 0.03,
      });
    }

    // Let go. It coasts down rather than stopping.
    const releaseAt = delay + BOLT_DRIVE_SEGMENTS * BOLT_SEGMENT_STAGGER;
    tone({
      frequency: BOLT_PITCH_HIGH, endFrequency: BOLT_PITCH_REST,
      duration: 0.44, delay: releaseAt, type: "sawtooth", volume: 0.08,
    });
    tone({
      frequency: BOLT_PITCH_HIGH * 2.02, endFrequency: BOLT_PITCH_REST * 2.02,
      duration: 0.44, delay: releaseAt, type: "sawtooth", volume: 0.032,
    });
  }

  function chatter(speaker = "Rook", index = 0) {
    if (!isReady()) {
      return;
    }

    const now = context.currentTime;

    if (now < nextChatterAt) {
      return;
    }

    nextChatterAt = now + CHATTER_INTERVAL_SECONDS;
    const base = getSpeakerBaseFrequency(speaker);
    const wobble = ((index * 37) % 5) * 28;

    tone({
      frequency: base + wobble,
      duration: 0.028,
      type: "square",
      volume: 0.028,
    });
  }

  function updateEngine({ powered, thrusting, volumeScale = 1 }) {
    if (!isReady()) {
      return;
    }

    const now = context.currentTime;

    if (powered && thrusting && now >= nextThrustAt) {
      nextThrustAt = now + THRUST_TICK_SECONDS;
      brownNoiseBurst({ duration: 0.14, volume: 0.043 * volumeScale });
    }
  }

  // A wet cough / sputter for an engine misfire or fault escalation. Deeper
  // stages sound rougher and lower.
  function playEngineFault(stage = "degraded") {
    const deep = stage === "emergency" || stage === "failed";
    tone({ frequency: deep ? 96 : 130, endFrequency: deep ? 38 : 60, duration: deep ? 0.22 : 0.14, type: "sawtooth", volume: 0.1 });
    noiseBurst({ duration: deep ? 0.12 : 0.07, volume: 0.075 });
    if (deep) {
      tone({ frequency: 70, endFrequency: 30, duration: 0.18, delay: 0.14, type: "sawtooth", volume: 0.07 });
    }
  }

  function tone({ frequency, endFrequency = frequency, duration, delay = 0, type = "square", volume = 0.08 }) {
    if (!isReady()) {
      return;
    }

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);

    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
  }

  function noiseBurst({ duration, volume, delay = 0 }) {
    if (!isReady()) {
      return;
    }

    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime + delay;

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function brownNoiseBurst({ duration, volume, delay = 0 }) {
    if (!isReady()) {
      return;
    }

    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;

    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.025 * white) / 1.025;
      const envelope = 1 - index / data.length;
      data[index] = last * 3.6 * envelope;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const now = context.currentTime + delay;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function isReady() {
    resumeContext();
    return Boolean(isUnlocked && context && master);
  }

  function resumeContext() {
    if (context?.state === "suspended") {
      context.resume();
    }
  }

  return {
    chatter,
    playCargoTransfer,
    playContractPaid,
    playDock,
    playHullHit,
    playMiningShot,
    playMinerFault,
    playCollectorFault,
    playPanelBolted,
    playPanelDrop,
    playPanelReveal,
    playPickup,
    playPower,
    playRockBreak,
    playScanner,
    playUiClick,
    playEngineFault,
    unlock,
    updateEngine,
  };
}

function getSpeakerBaseFrequency(speaker) {
  return getNpcVoiceFrequency(speaker, 470);
}
