// Procedural Audio Engine for Diesel Duel
// No external files required. Pure Web Audio API.

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        
        // Engine Tone
        this.osc = null;
        this.engineGain = null;
        
        // Turbo Whistle
        this.turboOsc = null;
        this.turboGain = null;

        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.25; // Overall volume
        this.masterGain.connect(this.ctx.destination);

        // --- 1. Diesel Rumble (Sawtooth Wave) ---
        this.osc = this.ctx.createOscillator();
        this.osc.type = 'sawtooth'; // Buzzy, aggressive sound
        this.osc.frequency.value = 50; // Idle Hz
        
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.15; // Much softer rumble (was 0.3)
        
        // Filter to dampen the harshness of the sawtooth
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        this.osc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);
        
        this.osc.start();

        // --- 2. Turbo Whistle (Sine Wave) ---
        this.turboOsc = this.ctx.createOscillator();
        this.turboOsc.type = 'sine';
        this.turboOsc.frequency.value = 0;
        
        this.turboGain = this.ctx.createGain();
        this.turboGain.gain.value = 0; // Starts silent

        this.turboOsc.connect(this.turboGain);
        this.turboGain.connect(this.masterGain);
        this.turboOsc.start();

        this.initialized = true;
    }

    // Call this every frame with current RPM (0 - 3000+)
    updateRPM(rpm) {
        if (!this.initialized) return;

        // Base Rumble Pitch
        // Map 600 RPM -> 60Hz, 2500 RPM -> 180Hz
        const baseFreq = 50 + (rpm * 0.06); 
        this.osc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.05);

        // Rumble Volume (Loudest at high load/RPM)
        // const rumbleVol = 0.5 + (rpm / 5000); 
        // this.engineGain.gain.setTargetAtTime(rumbleVol, this.ctx.currentTime, 0.1);

        // Turbo Pitch (Whistle)
        // Map RPM to high frequency (1000Hz - 4000Hz)
        const turboFreq = 800 + (rpm * 1.5);
        this.turboOsc.frequency.setTargetAtTime(turboFreq, this.ctx.currentTime, 0.1);

        // Turbo Volume (Only audible at high RPM)
        let turboVol = 0;
        if (rpm > 1200) {
            turboVol = ((rpm - 1200) / 2000) * 0.15; // Max volume 0.15
        }
        this.turboGain.gain.setTargetAtTime(turboVol, this.ctx.currentTime, 0.1);
    }

    // Play "Pshhh" air brake sound
    triggerShiftSound() {
        if (!this.initialized) return;

        const bufferSize = this.ctx.sampleRate * 0.3; // 0.3 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Fill with white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Filter it to sound more like "air" and less like "static"
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1000;
        
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.value = 0.4;
        
        // Envelope: Fade out
        noiseGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        
        noise.start();
    }

    // Play a beep (high pitch for count, lower for GO)
    triggerBeep(pitch = 600, duration = 0.1) {
        if (!this.initialized) return;
        
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = pitch;
        
        const gain = this.ctx.createGain();
        gain.gain.value = 0.1;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    triggerFinish() {
        if (!this.initialized) return;

        // Play a simple major triad fanfare (C - E - G)
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        const now = this.ctx.currentTime;

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            
            const gain = this.ctx.createGain();
            gain.gain.value = 0.2;
            gain.gain.setValueAtTime(0.2, now + (i * 0.1));
            gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.1) + 1.0); // 1 sec decay
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(now + (i * 0.1));
            osc.stop(now + (i * 0.1) + 1.0);
        });
    }

    explode() {
        if (!this.initialized) return;
        this.osc.stop();
        this.turboOsc.stop();
        // Here we could synthesize a boom, but silence is also dramatic
    }

    stop() {
        if (this.ctx) {
            this.ctx.close();
            this.initialized = false;
        }
    }
}

export const audioEngine = new AudioEngine();
