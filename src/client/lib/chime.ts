// A short, gentle attention chime via WebAudio — no bundled asset. Browser autoplay
// policy keeps audio suspended until the first user gesture, so this stays silent
// (but never throws) until the user has interacted with the tab.
let ctx: AudioContext | null = null;

export function playChime(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* audio unavailable or blocked — ignore */
  }
}
