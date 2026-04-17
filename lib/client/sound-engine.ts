"use client";

type SoundKind = "chat" | "mail" | "lod";

type SoundPreset = {
  type: OscillatorType;
  startFrequency: number;
  endFrequency: number;
  peakGain: number;
  rampInSeconds: number;
  rampOutSeconds: number;
  durationSeconds: number;
  settleDelayMs: number;
};

const SOUND_PRESETS: Record<SoundKind, SoundPreset> = {
  chat: {
    type: "sine",
    startFrequency: 880,
    endFrequency: 440,
    peakGain: 0.45,
    rampInSeconds: 0.01,
    rampOutSeconds: 0.4,
    durationSeconds: 0.5,
    settleDelayMs: 250,
  },
  mail: {
    type: "sine",
    startFrequency: 1046.5,
    endFrequency: 523.25,
    peakGain: 0.35,
    rampInSeconds: 0.01,
    rampOutSeconds: 0.3,
    durationSeconds: 0.4,
    settleDelayMs: 150,
  },
  lod: {
    // Whistle: rises from 900→1400 Hz then the gain cut simulates the drop
    type: "sine",
    startFrequency: 900,
    endFrequency: 1400,
    peakGain: 0.5,
    rampInSeconds: 0.02,
    rampOutSeconds: 0.35,
    durationSeconds: 0.5,
    settleDelayMs: 80,
  },
};

let audioContext: AudioContext | null = null;
let playbackQueue: Promise<void> = Promise.resolve();
let primingRegistered = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const browserWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor =
    browserWindow.AudioContext ??
    browserWindow.webkitAudioContext;

  if (!Ctor) return null;

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new Ctor();
  }

  return audioContext;
}

function playPreset(ctx: AudioContext, preset: SoundPreset): Promise<void> {
  return new Promise<void>((resolve) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = preset.type;
    osc.frequency.setValueAtTime(preset.startFrequency, now);
    osc.frequency.exponentialRampToValueAtTime(
      preset.endFrequency,
      now + preset.rampOutSeconds
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(
      preset.peakGain,
      now + preset.rampInSeconds
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + preset.rampOutSeconds
    );

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + preset.durationSeconds);

    window.setTimeout(resolve, preset.settleDelayMs);
  });
}

async function playSound(kind: SoundKind): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  if (ctx.state !== "running") return;

  if (kind === "lod") {
    // Two-chirp whistle: short rising chirp, then longer sustained tone
    await playPreset(ctx, { ...SOUND_PRESETS.lod, durationSeconds: 0.18, settleDelayMs: 60 });
    await playPreset(ctx, { ...SOUND_PRESETS.lod, startFrequency: 1350, endFrequency: 1380, durationSeconds: 0.45, settleDelayMs: 100 });
    return;
  }

  await playPreset(ctx, SOUND_PRESETS[kind]);
}

export function warmSoundEngine(): void {
  void getAudioContext();
}

export function primeSoundEngine(): void {
  if (typeof window === "undefined" || primingRegistered) return;

  primingRegistered = true;

  const prime = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    window.removeEventListener("click", prime, true);
    window.removeEventListener("keydown", prime, true);
  };

  window.addEventListener("click", prime, true);
  window.addEventListener("keydown", prime, true);
}

export function queueNotificationSound(kind: SoundKind): void {
  playbackQueue = playbackQueue.then(() => playSound(kind));
}

export function requestBrowserNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => {});
}
