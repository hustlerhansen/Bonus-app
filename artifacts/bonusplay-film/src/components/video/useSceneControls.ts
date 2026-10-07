import { useCallback, useMemo, useState } from 'react';
export function useSceneControls(baseDurations: Record<string, number>) {
  const sceneKeys = useMemo(() => Object.keys(baseDurations), [baseDurations]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [tick, setTick] = useState(0);
  const durations = useMemo(() => {
    if (locked) {
      const key = sceneKeys[activeIndex];
      return { [`${key}_r1`]: baseDurations[key], [`${key}_r2`]: baseDurations[key] };
    }
    if (activeIndex === 0) return baseDurations;
    const out: Record<string, number> = {};
    for (let i = 0; i < sceneKeys.length; i++) {
      const key = sceneKeys[(activeIndex + i) % sceneKeys.length];
      out[key] = baseDurations[key];
    }
    return out;
  }, [locked, activeIndex, sceneKeys, baseDurations]);
  const onSceneChange = useCallback((rawKey: string) => {
    const index = sceneKeys.indexOf(rawKey.replace(/_r[12]$/, ''));
    if (index >= 0) setActiveIndex(index);
    setTick(t => t + 1);
  }, [sceneKeys]);
  const jumpTo = useCallback((index: number) => {
    setActiveIndex(index); setPaused(false); setMountKey(k => k + 1); setTick(t => t + 1);
  }, []);
  const toggleLock = useCallback(() => {
    setLocked(l => !l); setPaused(false); setMountKey(k => k + 1); setTick(t => t + 1);
  }, []);
  const togglePause = useCallback(() => setPaused(p => !p), []);
  return { sceneKeys, activeIndex, locked, paused, mountKey, tick, durations, onSceneChange, jumpTo, toggleLock, togglePause,
    activeDuration: baseDurations[sceneKeys[activeIndex]],
    activeStartTime: sceneKeys.slice(0, activeIndex).reduce((sum, key) => sum + baseDurations[key], 0),
    totalDuration: Object.values(baseDurations).reduce((sum, ms) => sum + ms, 0) };
}
