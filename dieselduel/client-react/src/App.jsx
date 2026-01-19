import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import { PHYSICS, GEARBOXES, CREDITS } from './gameConfig'
import { audioEngine } from './AudioEngine'
import './App.css'

// Conexión al servidor en el VPS
const socket = io('http://23.94.221.241:3200');

function App() {
  // --- UI State ---
  const [gameState, setGameState] = useState('waiting_start'); // Start in waiting mode
  const [countdown, setCountdown] = useState(5);
  
  // --- Visual State (Updated by loop) ---
  const [rpm, setRpm] = useState(PHYSICS.IDLE_RPM);
  const [gear, setGear] = useState(0); 
  const [speed, setSpeed] = useState(0); 
  const [distance, setDistance] = useState(0);
  const [uiEffect, setUiEffect] = useState(''); // '', 'vibrating', or 'shaking'
  const [opponentTime, setOpponentTime] = useState(null);
  const [finalTime, setFinalTime] = useState(0);
  const [driverFace, setDriverFace] = useState('(o_o)');
  const [temp, setTemp] = useState(85); // Engine Temp
  const [turbo, setTurbo] = useState(0); // Turbo Pressure (0.0 - 1.0)

  // --- Music State ---
  const audioRef = useRef(null);

  // --- Physics State (Mutable, strictly for calculations) ---
  const physics = useRef({
    rpm: PHYSICS.IDLE_RPM,
    gear: 0,
    speed: 0,
    distance: 0,
    temp: 85, 
    turbo: 0, // New Turbo State
    isShifting: false,
    startTime: 0,
    lastFrameTime: 0
  });

  const [playerId, setPlayerId] = useState(null);

  // --- Socket & Init ---
  useEffect(() => {
    // Parse URL params for gameId and playerId
    const params = new URLSearchParams(window.location.search);
    const gId = params.get('gameId') || 'room1'; // Fallback for dev
    const pId = params.get('playerId') || 'guest'; // Fallback for dev
    setPlayerId(pId);

    socket.on('connect', () => console.log('Connected to server'));
    socket.emit('join_game', { gameId: gId, playerId: pId, username: 'Racer' });
    socket.on('opponent_finished', (data) => setOpponentTime(data.time));

    // Prepare music but don't play yet
    const tracks = ['/Dirby_day.mp3', '/Doom.mp3', '/Skirmish.mp3'];
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    const audio = new Audio(randomTrack);
    audio.volume = 0.03; 
    audio.loop = true;
    audioRef.current = audio;
    
    return () => {
        socket.off();
        if(audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const handleStartGame = () => {
    // 1. Initialize Audio Context (Needs user gesture)
    audioEngine.init();
    
    // 2. Play Music
    if(audioRef.current) {
        audioRef.current.play().catch(e => console.log("Music play failed:", e));
    }
    
    // 3. Start Countdown
    setGameState('countdown');
  };

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
          temp: 80, // Starts at Operating Base (80C)
          turbo: 0, // Turbo starts empty
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
          // --- REALISTIC DIESEL TORQUE CURVE (ROBUST) ---
          
          // 1. Base acceleration dependent on gear
          let gearFactor = (14 - p.gear) * 0.1; 
          if (p.gear >= 10) gearFactor *= 0.6; 
          if (p.gear >= 12) gearFactor *= 0.7; // Was 0.5, giving more top-end push

          // 2. RPM Curve Factor
          let torqueCurve = 1.0;
          if (p.rpm < 800) {
              // Turbo Lag (Safe calc)
              torqueCurve = 0.4 + (Math.max(0, p.rpm - 200) / 600) * 0.6; 
          } else if (p.rpm > 2100) { // Extended Power Band (Was 1900)
              // Torque Drop-off starts later
              torqueCurve = Math.max(0.1, 1.0 - ((p.rpm - 2100) / 400)); 
          }
          
          // 3. Friction/Load Factor
          const frictionLoss = Math.max(0.1, 1.0 - (Math.max(0, p.rpm - 200) / 3300));
          
          let totalTorque = torqueCurve * frictionLoss;

          // --- TURBO LOGIC ---
          const targetTurbo = p.rpm > 1200 ? Math.min(1.0, (p.rpm - 1200) / 1000) : 0;
          
          if (p.turbo < targetTurbo) {
              p.turbo += 0.8 * deltaTime;
          } else {
              p.turbo -= 2.0 * deltaTime;
          }
          p.turbo = Math.min(1.0, Math.max(0, p.turbo));

          // Apply Turbo Boost (Safe)
          totalTorque *= (1.0 + (p.turbo * 0.25));
          
          // --- STALL PENALTY ---
          if (p.gear > 4 && p.rpm < 1000) totalTorque *= 0.2;
          if (p.gear > 8 && p.rpm < 1200) totalTorque *= 0.05;
          if (p.gear > 10 && p.rpm < 1300) totalTorque = 0;

          const gainRate = 950 * gearFactor * Math.max(0.0, totalTorque); 
          rpmChange = gainRate * deltaTime;
      }
      p.rpm = Math.min(PHYSICS.MAX_RPM, Math.max(PHYSICS.IDLE_RPM, p.rpm + rpmChange));

      // Audio
      try { 
          audioEngine.updateRPM(p.rpm); 
          // Optional: Update turbo sound volume if supported
          if(audioEngine.turboGain) audioEngine.turboGain.gain.value = p.turbo * 0.5;
      } catch(e){}

      // 2. Speed (km/h)
      // Target Speed = (RPM / Ratio) * Constant
      // Hybrid Access: Handle both Object (new) and Number (old cached) formats
      const rawRatio = GEARBOXES['12'].ratios[p.gear - 1];
      let ratio = 3.5; // Default fallback
      
      if (rawRatio) {
          if (typeof rawRatio === 'object' && rawRatio.r) {
              ratio = rawRatio.r; // New format { r: 6.0, ... }
          } else if (typeof rawRatio === 'number') {
              ratio = rawRatio; // Old format (number)
          }
      }

      const targetSpeed = (p.rpm / ratio) * PHYSICS.SPEED_CONSTANT;

      // Inertia
      // NaN Protection for Speed
      if (isNaN(p.speed)) p.speed = 0;
      let validTargetSpeed = isNaN(targetSpeed) ? 0 : targetSpeed;
      
      if (p.speed < validTargetSpeed) {
          p.speed += (validTargetSpeed - p.speed) * PHYSICS.INERTIA * deltaTime;
      } else {
          p.speed -= (p.speed - validTargetSpeed) * (PHYSICS.INERTIA * 0.5) * deltaTime;
      }

      // 3. Distance
      p.distance += (p.speed / 3.6) * deltaTime;

      // 4. Engine Temperature Physics (Realistic Thermal Inertia)
      let heatRate = 0;

      if (p.rpm > 2300) {
          // CRITICAL MELTDOWN (>2300 RPM)
          // Rises explosively fast. 90 -> 120 in ~1.5 seconds.
          heatRate = 20 * deltaTime; 
      } else if (p.rpm > 1900) {
          // OVERHEATING (>1900 RPM)
          // Rises steadily. The deeper in the red, the faster.
          // 1900rpm = +1 deg/sec
          // 2300rpm = +5 deg/sec
          const severity = (p.rpm - 1900) / 400; 
          heatRate = (1.0 + (severity * 4.0)) * deltaTime;
      } else if (p.rpm > 1200) {
          // OPERATING RANGE (1200 - 1900 RPM)
          // Thermostat Logic: Tries to maintain ~90-95C
          if (p.temp < 92) heatRate = 1.5 * deltaTime; // Warm up to optimal
          else if (p.temp > 95) heatRate = -0.2 * deltaTime; // Thermostat opens, slow cool
      } else {
          // IDLE / LOW LOAD (< 1200 RPM)
          // Heat Soak: Massive iron block holds heat. Cools VERY slowly.
          // Will basically never drop below 80C while running.
          if (p.temp > 85) heatRate = -0.5 * deltaTime; // Very slow cool down
          else if (p.temp < 80) heatRate = 2.0 * deltaTime; // Reheat to min op temp
      }
      
      p.temp = Math.max(80, p.temp + heatRate); // Never drops below 80C

      if (p.temp >= 120) { // Boom Threshold
          setGameState('blown_coasting');
          try { audioEngine.explode(); } catch(e){}
          const loseSfx = new Audio('/try_again.wav');
          loseSfx.volume = 1.0;
          loseSfx.play().catch(e => {});
          return;
      }

      // 5. Finish Line
      if (p.distance >= PHYSICS.GAME_DISTANCE) {
          const finishTime = now - p.startTime;
          setFinalTime(finishTime);
          endGame('finished', finishTime);
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
      setTemp(p.temp); 
      setTurbo(p.turbo); 
      
      // Tiered Warning Effects
      if (p.rpm > 2300) {
          setUiEffect('shaking');
      } else if (p.rpm > 1900 || p.temp > 100) {
          setUiEffect('vibrating');
      } else {
          setUiEffect('');
      }

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

  const endGame = (reason, timeArg = 0) => {
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
          
          const params = new URLSearchParams(window.location.search);
          const gId = params.get('gameId') || 'room1';
          
          socket.emit('finish_race', { 
              gameId: gId, 
              playerId: playerId, // Use state
              time: timeArg, // Use the argument passed directly
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

          // Helper for Hybrid Data Access
          const getGearData = (idx) => GEARBOXES['12'].ratios[idx];
          const getRatio = (data, def) => (data && typeof data === 'object') ? data.r : (typeof data === 'number' ? data : def);
          const getMin = (data) => (data && data.min) ? data.min : 1400;
          const getMax = (data) => (data && data.max) ? data.max : 1900;

          const currentData = getGearData(p.gear - 1);
          const nextData = getGearData(p.gear);

          const optMin = getMin(currentData);
          const optMax = getMax(currentData);

          if (p.rpm >= optMin && p.rpm <= optMax) {
              setDriverFace('(^_^)');
          } else if (p.rpm < optMin) {
              setDriverFace('(¬_¬)');
          }

          // Calculate Drop
          const currentRatio = getRatio(currentData, 3.5);
          const nextRatio = getRatio(nextData, 0.5);
          const dropFactor = nextRatio / currentRatio; // Just for reference, not used for math anymore

          // --- GRADUAL TURBO RETENTION LOGIC ---
          // 1. Calculate Target RPM based on Gear
          let baseTarget = 1800; // Low gears
          if (p.gear >= 5) baseTarget = 1950; // Mid gears
          if (p.gear >= 9) baseTarget = 2100; // High gears (Stretch it!)

          // 2. Add Chaos Factor (+/- 25 RPM)
          const variance = (Math.random() * 50) - 25;
          const targetRPM = baseTarget + variance;

          // 3. Calculate Distance to Target
          // We only care how CLOSE you are to the peak.
          // If you go OVER (e.g. 2150 vs 2100), it counts as 0 distance (Perfect)
          // provided you didn't blow the engine (handled elsewhere).
          const diff = Math.max(0, targetRPM - p.rpm);

          // 4. Determine Reward Tier
          let retention = 0.15; // Bronze (Minimum guaranteed)
          
          if (diff < 50) {
              retention = 0.50; // Diamond (Perfect)
          } else if (diff < 150) {
              retention = 0.35; // Gold (Excellent)
          } else if (diff < 300) {
              retention = 0.25; // Silver (Good)
          }

          // console.log(`Shift Analysis: Gear ${p.gear}->${p.gear+1} | RPM: ${Math.round(p.rpm)} | Target: ${Math.round(targetRPM)} | Diff: ${Math.round(diff)} | Retain: ${retention*100}%`);

          setTimeout(() => {
              p.gear++;
              p.isShifting = false;
              
              // Apply Retention
              p.turbo = p.turbo * retention;
              
              // FORCE RPM based on Speed (Anti-Spam Logic)
              // RPM = (Speed / Constant) * Ratio
              // This ensures if you shift too early (slow speed, high gear), RPMs drop to near zero.
              const realRatio = getRatio(nextData, 0.5);
              const forcedRPM = (p.speed / PHYSICS.SPEED_CONSTANT) * realRatio;
              
              // Add a tiny bit of "slip" (10%) so it doesn't feel robotic, but mostly strict math
              p.rpm = Math.max(PHYSICS.IDLE_RPM, forcedRPM); 

              console.log('Shift Complete. New Gear:', p.gear, 'RPM Drop to:', p.rpm);
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
      <div className={`racing-ui ${uiEffect}`}>
            {/* NEW 6-LAYER PARALLAX SYSTEM (Hyper-Speed Tuned) */}
            <div className="parallax-layer bg-layer-1" style={{backgroundPositionX: `-${distance * 0.05}px`}}></div> {/* Sky/Far */}
            <div className="parallax-layer bg-layer-2" style={{backgroundPositionX: `-${distance * 0.2}px`}}></div>
            <div className="parallax-layer bg-layer-3" style={{backgroundPositionX: `-${distance * 0.5}px`}}></div>
            <div className="parallax-layer bg-layer-4" style={{backgroundPositionX: `-${distance * 2.0}px`}}></div>
            <div className="parallax-layer bg-layer-5" style={{backgroundPositionX: `-${distance * 6.0}px`}}></div>
            <div className="parallax-layer bg-layer-6" style={{backgroundPositionX: `-${distance * 15.0}px`}}></div> {/* Front - WHOOSH! */}
            
            <div className="track-view">
                {gameState === 'blown_coasting' && <div className="smoke-effect"></div>}
                
                <div className="driver-face-standalone">{driverFace}</div>

                <img src="/truck.png" className="truck-sprite" alt="Truck" />
                <div className="road"></div>
            </div>

            <div className="hud">
                <div className="hud-top-row">
                    {/* LEFT: RPM Gauge + Indicators */}
                    <div className="gauge-group-left">
                        <div className="gauge rpm-gauge">
                            <div className="needle" style={{ transform: `rotate(${(rpm / PHYSICS.MAX_RPM) * 180 - 90}deg)` }}></div>
                            <span className="label">RPM</span>
                        </div>
                        
                        {/* Indicators Container */}
                        <div className="indicators-col">
                            {/* Thermometer */}
                            <div className="bar-vertical">
                                <div className="bar-icon">🌡️</div>
                                <div className="bar-bg">
                                    <div 
                                        className="bar-fill" 
                                        style={{ 
                                            height: `${Math.min(100, ((temp - 50) / 70) * 100)}%`,
                                            backgroundColor: temp > 100 ? 'red' : temp > 90 ? 'orange' : '#00ff00' 
                                        }}
                                    ></div>
                                </div>
                            </div>

                            {/* Turbo Gauge */}
                            <div className="bar-vertical">
                                <div className="bar-icon">💨</div>
                                <div className="bar-bg">
                                    <div 
                                        className="bar-fill" 
                                        style={{ 
                                            height: `${turbo * 100}%`,
                                            backgroundColor: '#00ccff',
                                            boxShadow: `0 0 ${turbo * 10}px #00ccff`
                                        }}
                                    ></div>
                                </div>
                            </div>
                        </div>
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

      {gameState === 'waiting_start' && (
         <div className="start-overlay" onClick={handleStartGame}>
             <div className="start-content">
                 <h1 className="start-title">DIESEL DUEL</h1>
                 <p className="start-prompt">TAP TO START ENGINE</p>
             </div>
         </div>
      )}

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
                Voice by {CREDITS.voice.author} ({CREDITS.voice.license}) <br/>
                Background by {CREDITS.background.author} ({CREDITS.background.license})
            </div>
        </div>
      )}
    </div>
  )
}

export default App