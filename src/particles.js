// Lightweight particle + effect pool: dust, bursts, confetti, shockwave rings.

import { rand, TAU } from './util.js';

export class Particles {
  constructor() {
    this.parts = [];
    this.rings = [];
  }

  clear() { this.parts.length = 0; this.rings.length = 0; }

  burst(x, y, color, n = 14, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(speed * 0.3, speed);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25,
        life: rand(0.35, 0.7), t: 0, size: rand(3, 7), color, grav: 700, shape: 'dot',
      });
    }
  }

  dust(x, y, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(20, 90);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
        life: rand(0.2, 0.45), t: 0, size: rand(2, 5), color: 'rgba(255,255,255,0.5)', grav: 60, shape: 'dot',
      });
    }
  }

  confetti(x, y, n = 40) {
    const colors = ['#ff5d6c', '#4da3ff', '#ffd94d', '#5fe08b', '#c58fff', '#ff9d5c'];
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), v = rand(120, 460);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rand(0.8, 1.6), t: 0, size: rand(4, 8),
        color: colors[i % colors.length], grav: 500, shape: 'confetti', spin: rand(-8, 8), ang: rand(0, TAU),
      });
    }
  }

  ring(x, y, radius, color, dur = 0.35) {
    this.rings.push({ x, y, radius, color, t: 0, dur });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= 1 - 0.9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.ang += p.spin * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.dur) this.rings.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.fillStyle = p.color;
      if (p.shape === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const k = r.t / r.dur;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 6 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.25 + 0.75 * k), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
