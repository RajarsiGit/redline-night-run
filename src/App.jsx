import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Flag, Heart, Maximize, Minimize, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { RaceSimulation, CONFIG } from './game/simulation.js';
import { RaceScene } from './game/scene.js';
import { RaceAudio } from './game/audio.js';

const BEST_KEY = 'redline.night-run.best.v1';
const formatScore = number => Math.floor(number).toLocaleString('en-US');
const formatTime = number => {
  const seconds = Math.ceil(Math.max(0, number));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const readBest = () => { try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); } catch { return 0; } };
const keysToInput = keys => ({
  accelerate: keys.has('KeyW') || keys.has('ArrowUp'),
  brake: keys.has('KeyS') || keys.has('ArrowDown'),
  left: keys.has('KeyA') || keys.has('ArrowLeft'),
  right: keys.has('KeyD') || keys.has('ArrowRight'),
  boost: keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight'),
});

function Key({ children, wide = false }) { return <kbd className={wide ? 'key key-wide' : 'key'}>{children}</kbd>; }
function Stat({ label, children, className = '' }) { return <div className={`stat ${className}`}><span className="eyebrow">{label}</span><strong>{children}</strong></div>; }

export default function App() {
  const canvasHost = useRef(null);
  const stage = useRef(null);
  const engine = useRef(null);
  const primary = useRef(null);
  const [race, setRace] = useState(() => new RaceSimulation().snapshot());
  const [best, setBest] = useState(readBest);
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const active = race.phase === 'racing' || race.phase === 'countdown';
  const ended = race.phase === 'finished' || race.phase === 'gameover';

  const action = useCallback(async name => {
    const current = engine.current;
    if (!current) return null;
    const { sim, audio, keys } = current;
    if (name === 'start' || name === 'restart') {
      sim.reset(); keys.clear(); stage.current?.focus({ preventScroll: true });
    } else if (name === 'pause') {
      if (sim.phase === 'paused') sim.resume(); else sim.pause();
      keys.clear();
    } else if (name === 'resume') { sim.resume(); keys.clear(); stage.current?.focus({ preventScroll: true }); }
    else if (name === 'menu') { sim.reset('ready'); keys.clear(); }
    else if (name === 'sound') {
      await audio.enable(!audio.enabled);
      setSound(audio.enabled);
    }
    if (audio.enabled && audio.context?.state === 'suspended') void audio.context.resume().catch(() => {});
    audio.update(sim);
    const next = sim.snapshot();
    setRace(next);
    return next;
  }, []);

  useEffect(() => {
    let visual;
    const sim = new RaceSimulation();
    const audio = new RaceAudio();
    const keys = new Set();
    try {
      visual = new RaceScene(canvasHost.current, () => {
        sim.pause(); keys.clear(); audio.update(sim); setRace(sim.snapshot());
        setError('The graphics connection was interrupted. Reload the game to get back on the road.');
      });
    } catch {
      setError('This game needs WebGL 2. Enable hardware acceleration in your browser, then reload the page.');
      return () => { audio.dispose(); visual?.dispose(); };
    }
    engine.current = { sim, visual, audio, keys };
    let previous = null;
    let accumulator = 0;
    let uiTime = 0;
    let previousPhase = sim.phase;
    let lastCountdown = 3;
    let disposed = false;
    visual.renderer.setAnimationLoop(time => {
      if (disposed) return;
      const dt = previous === null ? 0 : Math.min((time - previous) / 1000, .1);
      previous = time;
      accumulator += dt;
      const input = keysToInput(keys);
      while (accumulator >= 1 / 120) {
        sim.step(1 / 120, input);
        accumulator -= 1 / 120;
      }
      sim.drainEvents().forEach(event => audio.effect(event));
      if (sim.phase === 'countdown' && Math.ceil(sim.countdown) !== lastCountdown) audio.effect('countdown');
      lastCountdown = Math.ceil(sim.countdown);
      audio.update(sim);
      visual.render(sim, dt, time / 1000);
      uiTime += dt;
      if (uiTime > .075 || previousPhase !== sim.phase) {
        const next = sim.snapshot();
        setRace(next);
        uiTime = 0;
        if (previousPhase !== sim.phase && ['finished', 'gameover'].includes(sim.phase)) {
          const score = next.score;
          setBest(old => {
            const result = Math.max(old, score);
            try { localStorage.setItem(BEST_KEY, String(result)); } catch { /* Storage is optional. */ }
            return result;
          });
        }
        previousPhase = sim.phase;
      }
    });
    const controlCodes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'];
    const keyDown = event => {
      if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (controlCodes.includes(event.code) && (sim.phase === 'racing' || sim.phase === 'countdown')) {
        event.preventDefault(); keys.add(event.code);
      }
      if (event.repeat) return;
      if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); void action('pause'); }
      if (event.code === 'KeyR') { event.preventDefault(); void action('restart'); }
      if (event.code === 'KeyM') { event.preventDefault(); void action('sound'); }
      if (event.code === 'Enter' && event.target.tagName !== 'BUTTON') {
        event.preventDefault();
        if (['ready', 'finished', 'gameover'].includes(sim.phase)) void action('start');
        else if (sim.phase === 'paused') void action('resume');
      }
    };
    const keyUp = event => keys.delete(event.code);
    const stopInput = () => { keys.clear(); sim.pause(); audio.update(sim); setRace(sim.snapshot()); };
    const visibility = () => { if (document.hidden) stopInput(); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', stopInput);
    document.addEventListener('visibilitychange', visibility);

    // Optional WebMCP: these actions use exactly the same state as the visible controls.
    const lifecycle = new AbortController();
    if (document.modelContext?.registerTool) {
      const register = tool => {
        try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Experimental API is optional. */ }
      };
      register({
        name: 'read_race_status', title: 'Read race status',
        description: 'Read the current Redline race state, speed, score, distance, time remaining, and health.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: input => {
          if (input && Object.keys(input).length) throw new Error('No arguments are accepted.');
          return sim.snapshot();
        },
      });
      register({
        name: 'control_race_session', title: 'Control race session',
        description: 'Start, pause, resume, or restart the race. Restart discards the current run. Drive with the keyboard.',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'pause', 'resume', 'restart'] } }, required: ['action'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async input => {
          if (!input || Object.keys(input).length !== 1 || !['start', 'pause', 'resume', 'restart'].includes(input.action)) throw new Error('Invalid race action.');
          if (input.action === 'start' && !['ready', 'finished', 'gameover'].includes(sim.phase)) throw new Error('A race is already in progress.');
          if (input.action === 'pause' && !['racing', 'countdown'].includes(sim.phase)) throw new Error('The race is not running.');
          if (input.action === 'resume' && sim.phase !== 'paused') throw new Error('The race is not paused.');
          return action(input.action);
        },
      });
    }
    return () => {
      disposed = true; lifecycle.abort();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', stopInput);
      document.removeEventListener('visibilitychange', visibility);
      audio.dispose(); visual.dispose(); engine.current = null;
    };
  }, [action]);

  useEffect(() => {
    if (['ready', 'paused', 'finished', 'gameover'].includes(race.phase)) primary.current?.focus({ preventScroll: true });
  }, [race.phase]);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen();
      else setFullscreenMessage('Full screen is unavailable in this browser.');
    } catch { setFullscreenMessage('Full screen is unavailable here. Open the game in its own tab.'); }
  };

  const hold = (code, pressed, event) => {
    event.preventDefault();
    if (pressed) { event.currentTarget.setPointerCapture(event.pointerId); engine.current?.keys.add(code); }
    else engine.current?.keys.delete(code);
  };

  return (
    <div className="app-shell mx-auto w-full max-w-[1500px] px-4 md:px-8 lg:px-12">
      <header className="app-header flex items-center justify-between gap-4">
        <a href="./" className="brand flex items-center gap-3" aria-label="Redline home">
          <span className="brand-mark" aria-hidden="true">//</span>
          <span>REDLINE<span className="brand-caption">ARCADE RACING</span></span>
        </a>
        <div className="header-right flex items-center gap-3 md:gap-6">
          <span className="edition hidden sm:block">VOL. 01 <span>/</span> NIGHT RUN</span>
          <span className="keyboard-badge">KEYBOARD READY</span>
        </div>
      </header>

      <main>
        <div className="track-bar flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4"><span className="track-number">01</span><div><h1>MIDNIGHT EXPRESS</h1><p>5.0 km sprint <span>·</span> Beat the clock</p></div></div>
          <div className="flex items-center gap-4 md:gap-7">
            <div className="personal-best"><Trophy size={16} /><span>PERSONAL BEST</span><strong>{best ? formatScore(best) : '—'}</strong></div>
            <div className="flex items-center gap-2">
              <button className="icon-button" onClick={() => action('sound')} title="Toggle sound (M)" aria-label={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={sound}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
              <button className="icon-button" onClick={toggleFullscreen} title="Full screen" aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button>
            </div>
          </div>
        </div>
        {fullscreenMessage && <p role="status" className="notice">{fullscreenMessage}<button onClick={() => setFullscreenMessage('')} aria-label="Dismiss message"><X size={16} /></button></p>}

        <section ref={stage} className={`game-stage relative overflow-hidden ${race.boosting ? 'is-boosting' : ''}`} tabIndex={-1} aria-label="Redline racing game" aria-describedby="keyboard-guide">
          <div ref={canvasHost} className="canvas-host absolute inset-0" />
          <div className="vignette absolute inset-0 pointer-events-none" />
          <div className="film-grain absolute inset-0 pointer-events-none" />

          {race.phase !== 'ready' && !error && <>
            <div className="race-hud flex items-start justify-between gap-3">
              <div className="hud-clock"><span className="eyebrow">TIME LEFT</span><strong className={race.remaining < 20 ? 'danger-text' : ''}>{formatTime(race.remaining)}</strong></div>
              <div className="route-progress"><div><span>{(race.distance / 1000).toFixed(2)} KM</span><Flag size={15} /><span>5.00 KM</span></div><div className="progress-track"><i style={{ width: `${race.progress * 100}%` }} /></div></div>
              <div className="hud-score"><span className="eyebrow">SCORE</span><strong>{formatScore(race.score).padStart(5, '0')}</strong></div>
            </div>
            <div className="in-game-actions flex gap-2">
              <button className="icon-button glass" onClick={() => action('sound')} aria-label={sound ? 'Mute sound' : 'Enable sound'}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
              {active && <button className="icon-button glass" onClick={() => action('pause')} aria-label="Pause race"><Pause size={17} /></button>}
              <button className="icon-button glass" onClick={() => action('restart')} aria-label="Restart race"><RotateCcw size={17} /></button>
              {fullscreen && <button className="icon-button glass" onClick={toggleFullscreen} aria-label="Exit full screen"><Minimize size={17} /></button>}
            </div>
            <div className="driving-hud">
              <div className="health" aria-label={`${race.lives} of 3 lives remaining`}><span className="eyebrow">CAR CONDITION</span><div>{[1, 2, 3].map(i => <Heart key={i} size={21} className={i <= race.lives ? 'heart-full' : 'heart-empty'} />)}</div></div>
              <div className="speedometer"><div><strong>{String(race.speed).padStart(3, '0')}</strong><span>KM/H</span></div><div className="rpm-bars">{Array.from({ length: 18 }, (_, i) => <i key={i} className={`${i < race.speed / CONFIG.boostSpeed * 18 ? 'lit' : ''} ${i > 13 ? 'red' : ''}`} />)}</div></div>
              <div className="nitro"><div><span><Zap size={14} /> NITRO</span><strong>{Math.round(race.nitro)}%</strong></div><div className="nitro-track"><i style={{ width: `${race.nitro}%` }} /></div><span className="nitro-hint">HOLD SPACE TO BOOST</span></div>
            </div>
            {race.message && race.phase === 'racing' && <div className={`race-message ${race.message.includes('COLLISION') ? 'crash-message' : ''}`} role="status">{race.message}{race.combo > 1 && <small>{race.combo}× COMBO</small>}</div>}
            {race.crashFlash > 0 && <div className="crash-flash absolute inset-0 pointer-events-none" style={{ opacity: race.crashFlash }} />}
          </>}

          {race.phase === 'ready' && !error && <div className="start-screen absolute inset-0">
            <div className="intro-copy">
              <span className="intro-kicker"><span /> THE CITY IS YOUR CIRCUIT</span>
              <h2>NIGHT<br /><span>RUN.</span></h2>
              <p>Open road. Heavy traffic.<br />One shot at the finish line.</p>
              <button ref={primary} className="primary-button" onClick={() => action('start')}>START ENGINE <ArrowUpRight size={22} /></button>
              <span className="enter-hint">or press <Key>↵</Key> Enter</span>
            </div>
            <div className="mission-label"><span>THE CHALLENGE</span><strong>5.0 <small>KM</small><i>/</i>110 <small>SEC</small></strong><p>Three lives. Make them count.</p></div>
            <div className="stage-caption"><span className="live-dot" /> AFTER HOURS <span>23:48 / CLEAR SKIES</span></div>
          </div>}

          {race.phase === 'countdown' && !error && <div className="countdown-overlay absolute inset-0" aria-live="polite"><span>GET READY</span><strong key={race.countdown}>{race.countdown || 'GO'}</strong><p>Hold <Key>W</Key> or <Key><ArrowUp size={15} /></Key> to accelerate</p></div>}

          {race.phase === 'paused' && !error && <div className="modal-overlay absolute inset-0"><div className="race-modal" role="dialog" aria-modal="false" aria-labelledby="pause-title"><span className="eyebrow">TAKE A BREATHER</span><h2 id="pause-title">RACE PAUSED</h2><p>Your run is right where you left it.</p><button ref={primary} className="primary-button" onClick={() => action('resume')}>BACK TO THE ROAD <Play size={18} /></button><button className="secondary-button" onClick={() => action('restart')}><RotateCcw size={16} /> Restart race</button><button className="text-button" onClick={() => action('menu')}>Back to start</button><span className="modal-hint">Press P or Esc to resume</span></div></div>}

          {ended && !error && <div className="modal-overlay absolute inset-0"><div className="race-modal results-modal" role="dialog" aria-modal="false" aria-labelledby="result-title">
            <span className="result-icon">{race.phase === 'finished' ? <Flag size={26} /> : <RotateCcw size={25} />}</span>
            <span className="eyebrow">{race.phase === 'finished' ? 'THE CITY IS BEHIND YOU' : race.finishReason === 'timeout' ? 'THE CLOCK WON THIS TIME' : 'THE ROAD FOUGHT BACK'}</span>
            <h2 id="result-title">{race.phase === 'finished' ? 'FINISH LINE.' : race.finishReason === 'timeout' ? 'TIME’S UP.' : 'WIPED OUT.'}</h2>
            <div className="final-score">{formatScore(race.score)}<span>POINTS {race.score > 0 && race.score >= best ? ' / PERSONAL BEST' : ''}</span></div>
            <div className="result-stats grid grid-cols-3 gap-3"><Stat label="DISTANCE">{(race.distance / 1000).toFixed(2)}<small> km</small></Stat><Stat label="OVERTAKES">{race.overtakes}</Stat><Stat label="NEAR MISSES">{race.nearMisses}</Stat></div>
            <button ref={primary} className="primary-button" onClick={() => action('restart')}>RACE AGAIN <RotateCcw size={18} /></button><button className="text-button" onClick={() => action('menu')}>Back to start</button>
          </div></div>}

          {error && <div className="modal-overlay absolute inset-0"><div className="race-modal"><span className="eyebrow">PIT STOP</span><h2>ONE QUICK FIX.</h2><p role="alert">{error}</p><button className="primary-button" onClick={() => window.location.reload()}>RELOAD GAME <RotateCcw size={18} /></button></div></div>}

          {race.phase === 'racing' && <div className="touch-controls">
            <div>{[['KeyA', ArrowLeft, 'Steer left'], ['KeyD', ArrowRight, 'Steer right']].map(([code, Icon, label]) => <button key={code} aria-label={label} onPointerDown={e => hold(code, true, e)} onPointerUp={e => hold(code, false, e)} onPointerCancel={e => hold(code, false, e)} onLostPointerCapture={e => hold(code, false, e)}><Icon size={24} /></button>)}</div>
            <div>{[['Space', Zap, 'Nitro boost'], ['KeyS', ArrowDown, 'Brake'], ['KeyW', ArrowUp, 'Accelerate']].map(([code, Icon, label]) => <button key={code} aria-label={label} className={code === 'KeyW' ? 'touch-gas' : ''} onPointerDown={e => hold(code, true, e)} onPointerUp={e => hold(code, false, e)} onPointerCancel={e => hold(code, false, e)} onLostPointerCapture={e => hold(code, false, e)}><Icon size={24} /></button>)}</div>
          </div>}
        </section>

        <section className="controls-panel" id="keyboard-guide" aria-label="Keyboard controls">
          <div className="controls-heading"><span className="eyebrow">STAY IN CONTROL</span><span>YOUR KEYS TO THE CITY</span></div>
          <div className="control-item"><div><Key>W</Key><span>/</span><Key><ArrowUp size={14} /></Key></div><span>Accelerate</span></div>
          <div className="control-item"><div><Key>A</Key><Key>D</Key><span>/</span><Key><ArrowLeft size={14} /></Key><Key><ArrowRight size={14} /></Key></div><span>Steer</span></div>
          <div className="control-item"><div><Key>S</Key><span>/</span><Key><ArrowDown size={14} /></Key></div><span>Brake</span></div>
          <div className="control-item"><div><Key wide>SPACE</Key><Zap size={14} className="accent" /></div><span>Nitro boost</span></div>
          <div className="control-item"><div><Key>P</Key><span>/</span><Key wide>ESC</Key></div><span>Pause</span></div>
          <div className="control-item"><div><Key>R</Key></div><span>Restart</span></div>
        </section>
        <footer className="page-footer flex flex-wrap items-center justify-between gap-3"><p><Zap size={14} /> Close passes earn bonus points and refill your nitro.</p><span>BUILT FOR THE FAST LANE <i>↗</i></span></footer>
      </main>
    </div>
  );
}
