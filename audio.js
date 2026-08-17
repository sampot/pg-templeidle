const PATHS = {
  tap: "./assets/audio/tap.ogg",
  incense: "./assets/audio/incense.ogg",
  click: "./assets/audio/click.ogg",
  upgrade: "./assets/audio/upgrade.ogg",
  coin: "./assets/audio/coin.ogg",
};

export class TempleAudio {
  constructor() {
    this.enabled = true;
    this.started = false;
    this.music = new Audio("./assets/audio/bgm.ogg");
    this.music.loop = true;
    this.music.volume = 0.24;
    this.effects = Object.fromEntries(
      Object.entries(PATHS).map(([name, path]) => {
        const audio = new Audio(path);
        audio.volume = name === "coin" ? 0.5 : 0.38;
        return [name, audio];
      }),
    );
  }

  async start() {
    this.started = true;
    if (!this.enabled) return;
    try {
      await this.music.play();
    } catch {
      // Autoplay may require a later explicit tap.
    }
  }

  suspend() {
    this.music.pause();
    for (const effect of Object.values(this.effects)) {
      effect.pause();
    }
  }

  resume() {
    if (!this.enabled || !this.started) return;
    void this.music.play().catch(() => {});
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.suspend();
    } else if (this.started) {
      this.resume();
    }
  }

  play(name) {
    if (!this.enabled || !this.effects[name]) return;
    const effect = this.effects[name];
    effect.currentTime = 0;
    void effect.play().catch(() => {});
  }
}
