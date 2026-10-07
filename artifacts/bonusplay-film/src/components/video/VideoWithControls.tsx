import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const TITLES = ['Intro', 'Poeng', 'Minispill', 'Daglig bonus', 'Demobelønninger', 'BONUSPLAY'];
const time = (ms: number) => `${Math.floor(ms / 60000)}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;
function PlaybackStatus({ controls, onJump }: { controls: ReturnType<typeof useSceneControls>; onJump: (index: number) => void }) {
  const { tick, paused, activeDuration, activeStartTime, totalDuration, sceneKeys, activeIndex } = controls;
  const [elapsed, setElapsed] = useState(0);
  const base = useRef(0);
  useEffect(() => { setElapsed(0); base.current = 0; }, [tick]);
  useEffect(() => {
    if (paused) return;
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(base.current + performance.now() - started), 60);
    return () => { window.clearInterval(timer); base.current += performance.now() - started; };
  }, [tick, paused]);
  return <>
    <div className="control-segments">{sceneKeys.map((key, i) => <button key={key} aria-label={`Scene ${i + 1}: ${TITLES[i]}`} aria-current={i === activeIndex ? 'true' : undefined} onClick={() => onJump(i)}>
      <span style={{ width: `${i === activeIndex ? Math.min(1, elapsed / activeDuration) * 100 : 0}%` }} /></button>)}</div>
    <span className="control-counter">{activeIndex + 1}/{sceneKeys.length}</span>
    <span className="control-time" role="timer">{time(Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration)))} / {time(totalDuration)}</span>
  </>;
}
export default function VideoWithControls() {
  const isIframed = window.self !== window.top;
  const controls = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensor = useRef<HTMLDivElement>(null);
  const handleJump = useCallback((index: number) => {
    controls.jumpTo(index);
    window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: {
      sceneIndex: index, sceneCount: controls.sceneKeys.length, sceneTitle: TITLES[index],
      filePath: `src/components/video/video_scenes/Scene${index + 1}.tsx`, lineNumber: 1,
    } }, '*');
  }, [controls.jumpTo, controls.sceneKeys.length]);
  useEffect(() => {
    if (!controls.paused) return;
    const frozen = document.getAnimations().filter(a => a.playState === 'running');
    frozen.forEach(a => a.pause());
    return () => frozen.forEach(a => a.play());
  }, [controls.paused]);
  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const outside = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && sensor.current && !sensor.current.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [collapsed, tapPinned]);
  const enter = (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setHovering(true); };
  const leave = (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setHovering(false); };
  if (!isIframed) return <VideoTemplate />;
  const visible = !collapsed || hovering || tapPinned;
  return <div className="video-preview">
    <VideoTemplate key={controls.mountKey} durations={controls.durations} paused={controls.paused} muted={muted} onSceneChange={controls.onSceneChange} />
    <div ref={sensor} className="control-sensor" onPointerEnter={enter} onPointerLeave={leave} onPointerDown={e => { if (e.pointerType !== 'mouse' && collapsed) setTapPinned(true); }}>
      <div className="control-filler" />
      <div className={`video-controls ${visible ? 'visible' : ''}`} aria-hidden={!visible}>
        <button aria-label={controls.paused ? 'Spill av' : 'Pause'} onClick={controls.togglePause}>{controls.paused ? <Play /> : <Pause />}</button>
        <button aria-label="Gjenta denne scenen" aria-pressed={controls.locked} onClick={controls.toggleLock}><Repeat /></button>
        <button aria-label={muted ? 'Slå på lyd' : 'Demp lyd'} onClick={() => setMuted(m => !m)}>{muted ? <VolumeX /> : <Volume2 />}</button>
        <div className="control-divider" />
        <PlaybackStatus controls={controls} onJump={handleJump} />
        <button aria-label={collapsed ? 'Vis kontroller' : 'Skjul kontroller'} onClick={() => { setCollapsed(c => !c); setHovering(false); setTapPinned(false); }}>{collapsed ? <ChevronUp /> : <ChevronDown />}</button>
      </div>
    </div>
  </div>;
}
