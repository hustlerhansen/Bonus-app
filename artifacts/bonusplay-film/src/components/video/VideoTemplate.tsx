import { useEffect, useRef } from 'react';
import { VideoCanvas, type VideoAspectRatio, useVideoPlayer, VideoPausedContext } from '@/lib/video';
import { AnimatePresence } from 'framer-motion';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import './film.css';
export const SCENE_DURATIONS = { intro: 4200, points: 5000, games: 5000, streak: 5000, rewards: 5600, finale: 5200 };
const SCENES = [Scene1, Scene2, Scene3, Scene4, Scene5, Scene6];
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '9:16';
const SCENE_START_SEC: Record<string, number> = {};
let offset = 0;
for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
  SCENE_START_SEC[key] = offset / 1000;
  offset += duration;
}

export default function VideoTemplate({ durations = SCENE_DURATIONS, loop = true, paused = false, muted = false, onSceneChange }: {
  durations?: Record<string, number>; loop?: boolean; paused?: boolean; muted?: boolean; onSceneChange?: (key: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const baseKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseKey);
  const Scene = SCENES[sceneIndex];
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastKey = useRef<string | null>(null);
  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = .45;
    if (paused) { audio.pause(); return; }
    if (lastKey.current !== currentSceneKey) {
      lastKey.current = currentSceneKey;
      const target = SCENE_START_SEC[baseKey] ?? 0;
      if (Math.abs(audio.currentTime - target) > .18) audio.currentTime = target;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseKey, paused, muted]);
  return (
    <VideoPausedContext.Provider value={paused}>
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: '#070b1c' }}>
      <AnimatePresence mode="sync"><Scene key={currentSceneKey} /></AnimatePresence>
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`} preload="auto" autoPlay muted={muted} />
    </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}
