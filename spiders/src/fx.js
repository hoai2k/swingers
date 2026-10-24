// Particles, flashes, decals and screen shake. Everything visual-only
// lives here so gameplay modules just call fx.burst(...) etc.
//
// Particle kinds: 'spark' (additive streak), 'smoke', 'blob' (filled
// circle), 'shard' (spinning quad), 'ring' (expanding shockwave), 'text',
// 'line' (fading segment, e.g. bullet tracers / beams), 'glow'.

import { rand, TAU } from './util.js';

export class FX {
  constructor() {
    this.parts = [];
    this.decals = [];       // persistent splats (cleared each round)
    this.shakeAmt = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.flashA = 0; this.flashColor = '#fff';
    this.shakeEnabled = true;
  }

  clear() { this.parts.length = 0; this.decals.length = 0; this.shakeAmt = 0; this.flashA = 0; }

  add(p) {
    if (this.parts.length > 2500) this.parts.shift();
    p.t = 0;
    p.life = p.life || 0.5;
    this.parts.push(p);
    return p;
  }

  shake(a) { if (this.shakeEnabled) this.shakeAmt = Math.min(40, this.shakeAmt + a); }
  flash(color = '#fff', a = 0.5) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }

  spark(x, y, vx, vy, color = '#ffe08a', life = 0.35, size = 2) {
    return this.add({ kind: 'spark', x, y, vx, vy, color, life, size, drag: 3, g: 600 });
  }

  burst(x, y, { n = 12, speed = 400, color = '#ffe08a', life = 0.4, size = 2.5, kind = 'spark', g = 600, spread = TAU, dir = 0, drag = 3 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * rand(0.3, 1);
      this.add({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: life * rand(0.6, 1.2), size: size * rand(0.6, 1.4), g, drag, rot: rand(0, TAU), vr: rand(-12, 12) });
    }
  }

  smoke(x, y, { n = 6, color = 'rgba(80,80,90,0.5)', size = 18, life = 0.9, speed = 60 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.add({ kind: 'smoke', x, y, vx: Math.cos(a) * speed * Math.random(), vy: Math.sin(a) * speed * Math.random() - 30, color, size: size * rand(0.6, 1.3), life: life * rand(0.7, 1.2), drag: 2, g: -40 });
    }
  }

  ring(x, y, r = 80, color = '#fff', life = 0.3, width = 6) {
    return this.add({ kind: 'ring', x, y, r, color, life, width });
  }

  line(x1, y1, x2, y2, color = '#fff', width = 3, life = 0.12, glow = true) {
    return this.add({ kind: 'line', x: x1, y: y1, x2, y2, color, width, life, glow });
  }

  text(x, y, str, color = '#fff', size = 28, life = 1) {
    return this.add({ kind: 'text', x, y, vx: 0, vy: -60, str, color, size, life, drag: 1 });
  }

  glow(x, y, r, color, life = 0.15) {
    return this.add({ kind: 'glow', x, y, r, color, life });
  }

  explosion(x, y, r = 120, color = '#ffb347') {
    this.glow(x, y, r * 1.6, color, 0.25);
    this.ring(x, y, r * 1.1, '#fff4c2', 0.28, 10);
    this.burst(x, y, { n: 30, speed: r * 7, color: '#ffd27a', life: 0.5, size: 3.5 });
    this.burst(x, y, { n: 14, speed: r * 4, color: '#ff6a2a', life: 0.7, size: 6, kind: 'blob', g: 300 });
    this.smoke(x, y, { n: 14, size: r * 0.35, speed: r * 2.5, life: 1.3, color: 'rgba(60,55,60,0.55)' });
    this.shake(r / 7);
    this.flash('#fff2cc', 0.25);
  }

  splat(x, y, color, n = 24, speed = 500) {
    this.burst(x, y, { n, speed, color, life: 0.8, size: 5, kind: 'blob', g: 1400, drag: 1 });
    for (let i = 0; i < 5; i++) {
      this.decals.push({ x: x + rand(-30, 30), y: y + rand(-30, 30), r: rand(4, 14), color });
    }
    if (this.decals.length > 400) this.decals.splice(0, this.decals.length - 400);
  }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      if (p.vx !== undefined) {
        const d = Math.max(0, 1 - (p.drag || 0) * dt);
        p.vx *= d; p.vy *= d;
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    this.shakeAmt *= Math.pow(0.0015, dt);
    if (this.shakeAmt < 0.3) this.shakeAmt = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeAmt;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeAmt;
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
  }

  drawDecals(ctx) {
    for (const d of this.decals) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      switch (p.kind) {
        case 'smoke':
          ctx.globalAlpha = k * 0.8;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU); ctx.fill();
          break;
        case 'blob':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU); ctx.fill();
          break;
        case 'shard':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
          ctx.restore();
          break;
        case 'text':
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.fillStyle = p.color;
          ctx.font = `700 ${p.size}px 'Fredoka', sans-serif`;
          ctx.textAlign = 'center';
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
          ctx.strokeText(p.str, p.x, p.y);
          ctx.fillText(p.str, p.x, p.y);
          break;
        default: break;
      }
    }
    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      switch (p.kind) {
        case 'spark': {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
          ctx.stroke();
          break;
        }
        case 'ring':
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * k + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * k * 0.8), 0, TAU); ctx.stroke();
          break;
        case 'line':
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineCap = 'round';
          if (p.glow) {
            ctx.lineWidth = p.width * 3;
            ctx.globalAlpha = k * 0.3;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
            ctx.globalAlpha = k;
          }
          ctx.lineWidth = p.width * (0.4 + 0.6 * k);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          break;
        case 'glow': {
          ctx.globalAlpha = k;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
          break;
        }
        default: break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

// helper: draw a glowing line (sabers, beams, lasers)
export function glowLine(ctx, x1, y1, x2, y2, color, width, core = '#ffffff') {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.25; ctx.lineWidth = width * 3.2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.globalAlpha = 0.55; ctx.lineWidth = width * 1.8;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.globalAlpha = 1; ctx.strokeStyle = core; ctx.lineWidth = width * 0.75;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}
