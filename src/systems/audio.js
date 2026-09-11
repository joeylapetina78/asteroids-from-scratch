import { getNpcVoiceFrequency } from "../content/npcs.js?v=fresh-20260910-2000-2fc8171c";

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
  // Run backwards from the first drill: it spins UP quickly and then settles
  // into a long note that sags slightly, rather than winding up slowly and
  // coasting down at the end. That is the trigger pulled and held — the motor
  // finding its speed and then bogging into the work.
  //
  // Two moments and no more. An earlier version faked its sustain out of four
  // overlapping segments, and every overlap re-attacked, so it came out as a
  // run of separate pitches — a riff rather than a tool. `tone` holds a level
  // now, so the long part is a single note.
  //
  // Low, because this is heavy machinery going into a ship. Quiet, because it
  // is a background confirmation and not an event.
  const BOLT_PITCH_START = 24;
  const BOLT_PITCH_PEAK = 74;
  const BOLT_PITCH_SETTLE = 48;
  const BOLT_SPIN_UP_LENGTH = 0.25;
  const BOLT_DRIVE_LENGTH = 0.43;
  // Most of the drive sits flat; only the tail tapers.
  const BOLT_DRIVE_HOLD = 0.33;
  // The drive opens before the spin-up has finished, so the join is a
  // crossfade rather than a second attack.
  const BOLT_DRIVE_AT = 0.16;
  const BOLT_VOLUME = 0.025;
  // A detuned partner just above the fundamental: two saws beating is the
  // difference between a motor and an organ note.
  const BOLT_DETUNE = 2.02;

  function playPanelBolted(delay = 0) {
    const pair = ({ frequency, endFrequency, duration, at, hold = 0, level }) => {
      tone({ frequency, endFrequency, duration, hold, delay: at, type: "sawtooth", volume: level });
      tone({
        frequency: frequency * BOLT_DETUNE,
        endFrequency: endFrequency * BOLT_DETUNE,
        duration,
        hold,
        delay: at,
        type: "sawtooth",
        volume: level * 0.38,
      });
    };

    // Trigger pulled: it comes up to speed.
    pair({
      frequency: BOLT_PITCH_START, endFrequency: BOLT_PITCH_PEAK,
      duration: BOLT_SPIN_UP_LENGTH, at: delay, level: BOLT_VOLUME * 0.9,
    });

    // And then it is in the work, holding and bogging a little.
    pair({
      frequency: BOLT_PITCH_PEAK, endFrequency: BOLT_PITCH_SETTLE,
      duration: BOLT_DRIVE_LENGTH, hold: BOLT_DRIVE_HOLD,
      at: delay + BOLT_DRIVE_AT, level: BOLT_VOLUME,
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

  // `hold` keeps a note at full level for that many seconds before it starts
  // decaying. Without it every note decays across its entire duration, which
  // is right for a blip and wrong for anything that is supposed to be running
  // — a sustained sound has to be faked out of overlapping notes, and the
  // re-attack at each overlap is audible as a separate note.
  function tone({
    frequency, endFrequency = frequency, duration, delay = 0,
    type = "square", volume = 0.08, hold = 0,
  }) {
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

    const level = Math.max(0.0001, volume);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.008);
    if (hold > 0) {
      gain.gain.setValueAtTime(level, start + Math.min(hold, duration));
    }
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
