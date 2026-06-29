import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
  gravity: number;
  fade: number;
}

interface Rocket {
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  color: string;
}

interface FireworksCanvasProps {
  zIndex?: number;
}

const FireworksCanvas: React.FC<FireworksCanvasProps> = ({ zIndex = 9999 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles: Particle[] = [];
    const rockets: Rocket[] = [];

    const colors = [
      '#ec4899', // Neon Pink (var(--primary))
      '#6366f1', // Neon Indigo (var(--secondary))
      '#10b981', // Emerald Green (var(--success))
      '#f59e0b', // Amber Gold (var(--warning))
      '#a855f7', // Electric Violet (var(--accent))
      '#38bdf8', // Sky Blue
      '#f43f5e'  // Rose Red
    ];

    const createExplosion = (x: number, y: number, color: string) => {
      const count = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 1.5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          color,
          size: Math.random() * 2 + 1.2,
          gravity: 0.05,
          fade: Math.random() * 0.012 + 0.008
        });
      }
    };

    const launchRocket = () => {
      const x = Math.random() * (width * 0.8) + (width * 0.1);
      const y = height;
      const tx = Math.random() * (width * 0.6) + (width * 0.2);
      const ty = Math.random() * (height * 0.4) + (height * 0.15);
      const angle = Math.atan2(ty - y, tx - x);
      const speed = Math.random() * 3 + 7;
      const color = colors[Math.floor(Math.random() * colors.length)];
      rockets.push({
        x,
        y,
        tx,
        ty,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color
      });
    };

    let tick = 0;

    const loop = () => {
      // Semi-transparent redraw to leave beautiful motion trails
      ctx.fillStyle = 'rgba(13, 5, 38, 0.2)'; // Matching local background
      ctx.fillRect(0, 0, width, height);

      // Rocket spawn rate
      tick++;
      if (tick % 30 === 0) {
        launchRocket();
      }

      // Update & Draw Rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;

        // Check target height or distance threshold
        const dist = Math.hypot(r.tx - r.x, r.ty - r.y);
        if (r.y <= r.ty || dist < 12) {
          createExplosion(r.x, r.y, r.color);
          rockets.splice(i, 1);
          continue;
        }

        // Draw rocket projectile
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = r.color;
        ctx.fill();
      }

      // Update & Draw Explosion Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.fade;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex,
        pointerEvents: 'none'
      }}
    />
  );
};

export default FireworksCanvas;
