// High-fidelity Web Audio API Sound Synthesizer for Cinematic Sports Terminal

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastClickTs = 0;
  }

  init() {
    if (typeof window === 'undefined') return;
    if (this.ctx && this.ctx.state === 'closed') {
      this.ctx = null;
    }
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
      this.ctx.resume().catch(() => {});
    }
  }

  _run(playFn) {
    if (!this.enabled || typeof window === 'undefined') return;
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'closed') {
      this.ctx = null;
      this.init();
      if (!this.ctx) return;
    }

    if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
      this.ctx.resume().then(() => {
        try { playFn(this.ctx); } catch {}
      }).catch(() => {});
    } else {
      try { playFn(this.ctx); } catch {}
    }
  }

  playClick() {
    const nowTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowTs - this.lastClickTs < 60) return;
    this.lastClickTs = nowTs;

    this._run((ctx) => {
      const now = Math.max(ctx.currentTime, 0.001);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.075);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    });
  }

  playHover() {
    this._run((ctx) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(480, now + 0.03);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    });
  }

  playAddParlay() {
    this._run((ctx) => {
      const now = ctx.currentTime;
      // Arpeggio chords
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(0.12, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.12);
      });
    });
  }

  playSuccess() {
    this._run((ctx) => {
      const now = ctx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.18, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.35);
      });
    });
  }

  playRadarScan() {
    this._run((ctx) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.25);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  playGlitchSound() {
    this._run((ctx) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(110, now + 0.05);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    });
  }
}

export const sounds = new SoundEngine();

// Global click delegator: ensures clicking any button, tab, card or interactive element plays sound
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    try {
      const target = e.target;
      const interactive = target?.closest?.('button, a, [role="button"], input[type="button"], input[type="submit"], select, .cursor-pointer');
      if (interactive) {
        sounds.playClick();
      }
    } catch {}
  }, { capture: true, passive: true });

  // Pre-warm Web Audio API on first user interaction
  const unlockAudio = () => {
    sounds.init();
    ['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
      window.removeEventListener(evt, unlockAudio);
    });
  };
  ['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { passive: true, once: true });
  });
}
