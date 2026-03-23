"use client";

import { useEffect, useState } from "react";

const COLORS = ["#7c3aed", "#a855f7", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#f43f5e"];
const PARTICLE_COUNT = 60;

type Particle = {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  size: number;
  drift: number;
};

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.8,
    duration: 1.5 + Math.random() * 1.5,
    size: 4 + Math.random() * 6,
    drift: -30 + Math.random() * 60,
  }));
}

export function Confetti({ onDone }: { onDone?: () => void }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Generate particles client-side only to avoid SSR/client Math.random() mismatch
    setParticles(generateParticles());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 3500);
    return () => clearTimeout(timer);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: "-10px",
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            ["--drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(var(--drift)) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
