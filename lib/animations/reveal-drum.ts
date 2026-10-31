export const revealDrumDurationMs = 1800;

// Called from the reveal button: browsers require a user gesture to start audio.
export function playRevealDrumRoll(): (() => void) | null {
  let context: AudioContext;
  try { context = new AudioContext(); } catch { return null; }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    void context.close().catch(() => {});
  };
  void context.resume().then(() => {
    if (stopped || context.state !== "running") return;
    const master = context.createGain();
    master.gain.value = .16;
    master.connect(context.destination);
    const noise = context.createBuffer(1, Math.ceil(context.sampleRate * .12), context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    const start = context.currentTime + .02;
    for (let beat = 0; beat < 26; beat++) {
      const progress = beat / 25;
      const at = start + 1.48 * (1 - (1 - progress) ** 1.65);
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1300;
      const envelope = context.createGain();
      const volume = (.2 + progress * .38) * (beat % 2 ? .75 : 1);
      envelope.gain.setValueAtTime(volume, at);
      envelope.gain.exponentialRampToValueAtTime(.001, at + .09);
      source.connect(filter).connect(envelope).connect(master);
      source.start(at);
      source.stop(at + .12);
      const body = context.createOscillator();
      const bodyGain = context.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(170, at);
      body.frequency.exponentialRampToValueAtTime(75, at + .09);
      bodyGain.gain.setValueAtTime(volume * .8, at);
      bodyGain.gain.exponentialRampToValueAtTime(.001, at + .11);
      body.connect(bodyGain).connect(master);
      body.start(at);
      body.stop(at + .12);
    }
    const finish = context.createOscillator();
    const finishGain = context.createGain();
    finish.frequency.setValueAtTime(130, start + 1.55);
    finish.frequency.exponentialRampToValueAtTime(45, start + 1.77);
    finishGain.gain.setValueAtTime(.7, start + 1.55);
    finishGain.gain.exponentialRampToValueAtTime(.001, start + 1.77);
    finish.connect(finishGain).connect(master);
    finish.start(start + 1.55);
    finish.stop(start + 1.78);
  }).catch(stop);
  return stop;
}
