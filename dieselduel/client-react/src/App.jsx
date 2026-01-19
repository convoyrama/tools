import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import { PHYSICS, GEARBOXES, CREDITS } from './gameConfig'
import { audioEngine } from './AudioEngine'
import './App.css'

const socket = io('http://localhost:3200');

function App() {
  // --- UI State ---
  const [gameState, setGameState] = useState('countdown'); // Start immediately in countdown
  const [countdown, setCountdown] = useState(5);
  
  // --- Visual State (Updated by loop) ---
  const [rpm, setRpm] = useState(PHYSICS.IDLE_RPM);
  const [gear, setGear] = useState(0); 
  const [speed, setSpeed] = useState(0); 
  const [distance, setDistance] = useState(0);
  const [redlineWarning, setRedlineWarning] = useState(false);
  const [opponentTime, setOpponentTime] = useState(null);
  const [finalTime, setFinalTime] = useState(0);
  const [driverFace, setDriverFace] = useState('(o_o)');

  // --- Music State ---
  const audioRef = useRef(null);

  // --- Physics State (Mutable, strictly for calculations) ---
  const physics = useRef({
    rpm: PHYSICS.IDLE_RPM,
    gear: 0,
    speed: 0,
    distance: 0,
    engineHealth: 100,
    isShifting: false,
    startTime: 0,
    lastFrameTime: 0
  });

  // --- Socket & Init ---
  useEffect(() => {
    socket.on('connect', () => console.log('Connected to server'));
    socket.emit('join_game', { gameId: 'room1', username: 'Player1' });
    socket.on('opponent_finished', (data) => setOpponentTime(data.time));

    // PLAY MUSIC
    const tracks = ['/Dirby_day.mp3', '/Doom.mp3', '/Skirmish.mp3'];
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    const audio = new Audio(randomTrack);
    audio.volume = 0.25; // Reduced volume (was 0.4)
    audio.loop = true;
    audioRef.current = audio;
    
    return () => {
        socket.off();
        if(audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  // --- Countdown Timer ---
  useEffect(() => {
    if (gameState !== 'countdown') return;

    let count = 5;
    setCountdown(5);
    
    // Try to init audio engines
    audioEngine.init();
    if(audioRef.current) audioRef.current.play().catch(e => console.log("Music blocked until interaction"));
    
    // Play READY sound
    const readySfx = new Audio('/ready.wav');
    readySfx.volume = 0.8;
    readySfx.play().catch(e => {});

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            setCountdown(count);
            // Optional: Tick sound here?
            try { audioEngine.triggerBeep(800, 0.1); } catch(e){}
        } else {
            clearInterval(timer);
            setCountdown("GO!");
            
            // Play GO sound
            const goSfx = new Audio('/go.wav');
            goSfx.volume = 0.8;
            goSfx.play().catch(e => {});
            
            // LAUNCH!
            startRace();
        }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState]);

  const startRace = () => {
      // Initialize Physics
      physics.current = {
          rpm: 1000, // Jump start
          gear: 1,   // Auto-engage 1st
          speed: 0,
          distance: 0,
          engineHealth: 100,
          isShifting: false,
          startTime: Date.now(),
          lastFrameTime: Date.now()
      };
      setGameState('racing');
  };

  // --- Game Loop (The Engine) ---
  useEffect(() => {
      let intervalId;
      
      if (gameState === 'racing' || gameState === 'blown_coasting') {
          console.log('Starting Physics Loop for state:', gameState);
          
          intervalId = setInterval(() => {
              updatePhysics();
          }, 33); // 30 FPS is plenty and safer for React rendering
      }

      return () => clearInterval(intervalId);
  }, [gameState]);

  const updatePhysics = () => {
      const now = Date.now();
      const p = physics.current; // Shortcut
      const deltaTime = (now - p.lastFrameTime) / 1000;
      p.lastFrameTime = now;

      // Skip if delta is crazy (lag spike protection)
      if (deltaTime > 0.2) return;

      // --- BLOWN ENGINE LOGIC ---
      if (gameState === 'blown_coasting') {
          p.rpm = Math.max(0, p.rpm - (3000 * deltaTime));
          p.speed = Math.max(0, p.speed - ((p.speed * 0.3 + 5) * deltaTime));
          p.distance += (p.speed / 3.6) * deltaTime;
          
          // Sync UI
          syncUI(p);

          if (p.speed <= 0) endGame('exploded');
          return;
      }

      // --- RACING LOGIC ---
      
      // 1. Calculate RPM Gain
      let rpmChange = 0;
      if (p.isShifting) {
          rpmChange = -1500 * deltaTime; 
      } else {
          // --- REALISTIC DIESEL TORQUE CURVE ---
          // 1. Base acceleration dependent on gear (lower gears = faster)
          let gearFactor = (14 - p.gear) * 0.1; 
          
          // Severe penalty for overdrive gears (10, 11, 12) due to air resistance
          if (p.gear >= 10) gearFactor *= 0.6; 
          if (p.gear >= 12) gearFactor *= 0.5; 

          // 2. RPM Curve Factor
          let torqueCurve = 1.0;
          
          if (p.rpm < 1300) {
              // TURBO LAG: Low power below 1300
              torqueCurve = 0.5 + ((p.rpm - 600) / 700) * 0.5; 
          } else if (p.rpm >= 1300 && p.rpm <= 1900) {
              // POWER BAND: Max torque
              torqueCurve = 1.0;
          } else {
              // CHOKING: Torque drops drastically above 1900
              // At 2500 it should be almost 0 acceleration
              const overflow = p.rpm - 1900;
              torqueCurve = Math.max(0.1, 1.0 - (overflow / 500)); 
          }
          
          const gainRate = 700 * gearFactor * torqueCurve; 
          rpmChange = gainRate * deltaTime;
      }
      p.rpm = Math.min(PHYSICS.MAX_RPM, Math.max(PHYSICS.IDLE_RPM, p.rpm + rpmChange));

      // Audio
      try { audioEngine.updateRPM(p.rpm); } catch(e){}

      // 2. Speed (km/h)
      // Target Speed = (RPM / Ratio) * Constant
      const ratio = GEARBOXES['12'].ratios[p.gear - 1] || 3.5;
      const targetSpeed = (p.rpm / ratio) * PHYSICS.SPEED_CONSTANT;

      // Inertia
      if (p.speed < targetSpeed) {
          p.speed += (targetSpeed - p.speed) * PHYSICS.INERTIA * deltaTime;
      } else {
          p.speed -= (p.speed - targetSpeed) * (PHYSICS.INERTIA * 0.5) * deltaTime;
      }

      // 3. Distance
      p.distance += (p.speed / 3.6) * deltaTime;

      // 4. Engine Health
      if (p.rpm > PHYSICS.REDLINE_RPM) {
          p.engineHealth -= (100 / (PHYSICS.ENGINE_BLOWOUT_TIME_MS / 1000)) * deltaTime;
      }
      if (p.engineHealth <= 0) {
          setGameState('blown_coasting');
          try { audioEngine.explode(); } catch(e){}
          // Play LOSE sound
          const loseSfx = new Audio('/try_again.wav');
          loseSfx.volume = 1.0;
          loseSfx.play().catch(e => {});
          return;
      }

      // 5. Finish Line
      if (p.distance >= PHYSICS.GAME_DISTANCE) {
          setFinalTime(now - p.startTime);
          endGame('finished');
          return;
      }

      // Sync UI
      syncUI(p);
  };

  const syncUI = (p) => {
      setRpm(Math.round(p.rpm));
      setSpeed(Math.round(p.speed));
      setDistance(Math.round(p.distance));
      setGear(p.gear);
      setRedlineWarning(p.rpm > PHYSICS.REDLINE_RPM);

      // --- Driver Face Logic ---
      if (gameState === 'blown_coasting' || gameState === 'exploded') {
          setDriverFace('(X_X)');
      } else if (p.rpm > PHYSICS.REDLINE_RPM) {
          setDriverFace('(>_<)');
      } else if (p.rpm > PHYSICS.WARNING_RPM) {
          setDriverFace('(O_O)');
      } else if (p.isShifting) {
          // Face set during shiftUp call
      } else {
          // Idle / Blinking Logic
          const now = Date.now();
          if (Math.floor(now / 2500) % 2 === 0 && (now % 2500) < 150) {
              setDriverFace('(-_-)');
          } else {
              setDriverFace('(o_o)');
          }
      }
  };

  const endGame = (reason) => {
      if (reason === 'finished') {
          try { 
              // KILL ENGINE SOUND
              physics.current.rpm = 0; 
              audioEngine.updateRPM(0); 
              audioEngine.engineGain.gain.value = 0; 
              audioEngine.turboGain.gain.value = 0;
              
              audioEngine.triggerFinish(); 
              
              // Play WIN sound
              const winSfx = new Audio('/congratulations.wav');
              winSfx.volume = 1.0;
              winSfx.play().catch(e => {});
          } catch(e){}
          
          const finalSpd = Math.round(physics.current.speed);
          socket.emit('finish_race', { 
              gameId: 'room1', 
              time: finalTime,
              speed: finalSpd 
          });
          setGameState('finished');
      } else {
          setGameState('exploded');
      }
  };

  // --- Controls ---
  const shiftUp = () => {
      // Try to start music if blocked
      if (audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(e => {});
      }

      const p = physics.current;
      const maxGears = 12;

      console.log('Shift Request. Gear:', p.gear, 'Shifting:', p.isShifting);

      if (p.gear < maxGears && !p.isShifting) {
          p.isShifting = true;
          try { audioEngine.triggerShiftSound(); } catch(e){}

          // Reaction based on shift timing
          if (p.rpm >= PHYSICS.OPTIMAL_MIN && p.rpm <= PHYSICS.OPTIMAL_MAX) {
              setDriverFace('(^_^)');
          } else if (p.rpm < PHYSICS.OPTIMAL_MIN) {
              setDriverFace('(¬_¬)');
          }

          // Calculate Drop
          const currentRatio = GEARBOXES['12'].ratios[p.gear - 1] || 3.5;
          const nextRatio = GEARBOXES['12'].ratios[p.gear] || 0.5;
          const dropFactor = nextRatio / currentRatio;

          setTimeout(() => {
              p.gear++;
              p.isShifting = false;
              p.rpm = p.rpm * dropFactor;
              console.log('Shift Complete. New Gear:', p.gear);
          }, PHYSICS.SHIFT_TIME_MS);
      }
  };

  useEffect(() => {
      const handleKeyDown = (e) => {
          if (audioEngine.ctx && audioEngine.ctx.state === 'suspended') {
              audioEngine.ctx.resume();
          }
          // Try music
          if (audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch(e => {});
          }
          
          if (gameState !== 'racing') return;
          
          if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
              e.preventDefault();
              shiftUp();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]); // Re-bind when state changes to ensure fresh context if needed

  // --- Render ---
  return (
    <div className="App">
      <div className={redlineWarning ? "racing-ui shaking" : "racing-ui"}>
            <div className="parallax-bg" style={{backgroundPositionX: `-${distance * 10}px`}}></div>
            
            <div className="track-view">
                {gameState === 'blown_coasting' && <div className="smoke-effect"></div>}
                
                <div className="driver-face-standalone">{driverFace}</div>

                <img src="/truck.png" className="truck-sprite" alt="Truck" />
                <div className="road"></div>
            </div>

            <div className="hud">
                <div className="hud-top-row">
                    {/* LEFT: RPM Gauge */}
                    <div className="gauge rpm-gauge">
                        <div className="needle" style={{ transform: `rotate(${(rpm / PHYSICS.MAX_RPM) * 180 - 90}deg)` }}></div>
                        <span className="label">RPM</span>
                    </div>
                    
                    {/* CENTER: Gear & Digital RPM */}
                    <div className="center-panel">
                        <div className="gear-display">{gear === 0 ? 'N' : gear}</div>
                        <div className="digital-rpm">{rpm} RPM</div>
                        <div className="dist-display">{(distance).toFixed(0)}m / {PHYSICS.GAME_DISTANCE}m</div>
                    </div>

                    {/* RIGHT: Speed Gauge */}
                    <div className="gauge speed-gauge">
                         {/* Max speed assumed 160km/h for gauge scale */}
                        <div className="needle" style={{ transform: `rotate(${(Math.min(speed, 160) / 160) * 180 - 90}deg)` }}></div>
                        <span className="label">KM/H</span>
                        <div className="digital-speed">{speed}</div>
                    </div>
                </div>

                {/* BOTTOM: Horizontal RPM Bar */}
                <div className="rpm-container">
                    <div className="rpm-bar-bg">
                        <div 
                            className={`rpm-fill ${rpm > PHYSICS.REDLINE_RPM ? 'bar-danger' : rpm > PHYSICS.WARNING_RPM ? 'bar-warning' : 'bar-normal'}`}
                            style={{ width: `${(rpm / PHYSICS.MAX_RPM) * 100}%` }}
                        ></div>
                    </div>
                     <div className="rpm-labels">
                        <span>0</span>
                        <span>500</span>
                        <span>1000</span>
                        <span>1500</span>
                        <span>2000</span>
                        <span className="danger-text">2500</span>
                    </div>
                </div>
            </div>

            {/* Tap Zone */}
            <div className="touch-controls" onClick={shiftUp}>
                 {gameState === 'racing' && <div className="touch-hint">TAP TO SHIFT</div>}
            </div>
      </div>

      {gameState === 'countdown' && (
         <div className="countdown-overlay">
             <h1 className="count-number">{countdown}</h1>
         </div>
      )}

      {(gameState === 'finished' || gameState === 'exploded') && (
        <div className="results">
            <h2>{gameState === 'exploded' ? 'ENGINE BLOWN!' : 'FINISH LINE!'}</h2>
            
            {gameState === 'finished' && (
                <div className="final-time">
                    <span className="time-label">TIME</span>
                    <span className="time-value">{(finalTime / 1000).toFixed(3)}s</span>
                    <div className="final-speed-text">
                         TOP SPEED: {Math.round(speed)} km/h
                    </div>
                </div>
            )}
            
            {gameState === 'exploded' && (
                 <p className="failure-text">Try shifting sooner!</p>
            )}
            
            <button className="start-btn" onClick={() => setGameState('countdown')}>RACE AGAIN</button>

            <div className="music-credits">
                Music by {CREDITS.music.author} ({CREDITS.music.license}) <br/>
                Voice by {CREDITS.voice.author} ({CREDITS.voice.license})
            </div>
        </div>
      )}
    </div>
  )
}

export default App