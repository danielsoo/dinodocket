"use client";

import { useEffect, useRef, useState } from "react";

// Pixel-art egg (33 frames, 48x48 each, from the shake-and-break clip):
//   0-12 wobble · 13-20 cracks spread · 21-22 shell bursts · 23-26 empty shell · 27-32 dino peeks out
const FRAMES = 33;
const SHAKE = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const HATCH = Array.from({ length: 12 }, (_, i) => i + 21); // 21..32
const PEEK_IDLE = [28, 29, 30, 31, 32, 31, 30, 29];
const FPS = 9;

function crackFrame(p: number) {
  // cracks start at half way and spread until the last block
  return p < 0.5 ? 0 : Math.min(20, 13 + Math.floor(((p - 0.5) / 0.5) * 8));
}

export default function DinoEgg({ progress, size = 112, celebrate = true }: { progress: number; size?: number; celebrate?: boolean }) {
  const p = Math.max(0, Math.min(1, progress));
  const hatched = p >= 1;
  // `anim` overrides the resting frame while an animation is playing
  const [anim, setFrame] = useState<number | null>(null);
  const frame = anim ?? (hatched ? 32 : crackFrame(p));
  const [wobble, setWobble] = useState(false);
  const prev = useRef(p);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const was = prev.current;
    prev.current = p;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    let alive = true;
    later(() => alive && setFrame(null), 0); // back to the resting frame for the new progress

    if (hatched) {
      if (was < 1 && celebrate && !reduce) {
        // just finished: burst open, then the dino peeks out
        HATCH.forEach((f, i) => later(() => alive && setFrame(f), (i * 1000) / FPS));
        later(() => alive && idlePeek(), (HATCH.length * 1000) / FPS + 600);
      } else if (!reduce) {
        later(idlePeek, 1200);
      }
    } else if (!reduce && p > 0) {
      loopShake();
    }

    function idlePeek() {
      let i = 0;
      const tick = () => {
        if (!alive) return;
        setFrame(PEEK_IDLE[i++ % PEEK_IDLE.length]);
        later(tick, i % PEEK_IDLE.length === 0 ? 2400 : 1000 / FPS);
      };
      tick();
    }

    function loopShake() {
      // The closer to the goal, the more often (and longer) it shakes.
      const gap = 6000 - 5200 * p; // 6s apart at the start, under 1s near the end
      const burst = () => {
        if (!alive) return;
        if (p < 0.5) {
          SHAKE.forEach((f, i) => later(() => alive && setFrame(f), (i * 1000) / FPS));
          later(() => alive && setFrame(null), (SHAKE.length * 1000) / FPS);
          later(burst, (SHAKE.length * 1000) / FPS + gap);
        } else {
          // cracked frames are upright; rock them with CSS instead
          setWobble(true);
          later(() => alive && setWobble(false), 900);
          later(burst, 900 + gap);
        }
      };
      later(burst, 400);
    }

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [p, hatched, celebrate]);

  return (
    <div
      role="img"
      aria-label={hatched ? "Your dino hatched" : `Egg, ${Math.round(p * 100)}% of the way to hatching`}
      className={wobble ? "egg-rock" : ""}
      style={{
        width: size,
        height: size,
        backgroundImage: "url(/egg-sprite.png)",
        backgroundRepeat: "no-repeat",
        backgroundSize: `${size * FRAMES}px ${size}px`,
        backgroundPosition: `${-frame * size}px 0`,
        imageRendering: "pixelated",
        // stronger rocking as the goal gets closer
        ["--rock" as string]: `${4 + 10 * Math.max(0, p - 0.5)}deg`,
      }}
    />
  );
}
