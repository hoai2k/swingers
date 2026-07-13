// Level construction + simulation + rendering.
//
// A level definition (see levels.js) is plain data:
//   { name, intro, w, h, bg:[top,bottom], plat, accent, hazard?,
//     spawn:{x,y}, goal:{x,y,r},
//     solids:  [{x,y,w,h, angle?, deadly?, spikeDir?, grab?, color?}]  (x,y = center)
//     ropes:   [{x,y,len}]
//     balloons:[{x,y}]
//     movers:  [{w,h, from:[x,y], to:[x,y], speed, phase?}]
//     spinners:[{x,y,len,thick?,speed,phase?}]
//     powerups:[{x,y}]
//     texts:   [{x,y,text,size?}] }
// Everything solid is grabbable unless deadly or grab:false.

import { clamp, lerp, TAU, hash01, roundRectPath } from './util.js';
import { CAT } from './player.js';
import { sfx } from './audio.js';

const M = window.Matter;

const BALLOON_R = 24;
const BALLOON_COLORS = ['#ff8fb3', '#8fd0ff', '#fff09e', '#b9f0b0'];
// Full player mass including both physical arm chains (body ~2.2 + arms ~1.3);
// balloon buoyancy is budgeted against this so one robot rises, two sink.
const REF_PLAYER_MASS = 3.5;
const POWERUP_RESPAWN = 9;
const BALLOON_RESPAWN = 3.5;

export class Level {
  constructor(def, engine) {
    this.def = def;
    this.engine = engine;
    this.w = def.w;
    this.h = def.h;
    this.spawn = def.spawn;
    this.goal = def.goal;
    this.time = 0;

    this.solids = [];      // {body,w,h,deadly,spikeDir,color}
    this.deadlyBodies = [];
    this.ropes = [];       // {anchor:{x,y}, segs:[bodies]}
    this.balloons = [];    // {home:{x,y}, body|null, respawnAt, color}
    this.movers = [];      // {body,w,h,from,to,speed,u}
    this.spinners = [];    // {body,len,thick,speed,angle}
    this.powerups = [];    // {x,y,active,respawnAt}

    for (const s of def.solids || []) this.addSolid(s);
    for (const r of def.ropes || []) this.addRope(r);
    for (const b of def.balloons || []) {
      const bl = { home: { x: b.x, y: b.y }, body: null, respawnAt: 0, color: BALLOON_COLORS[this.balloons.length % BALLOON_COLORS.length] };
      this.balloons.push(bl);
      this.spawnBalloon(bl);
    }
    for (const m of def.movers || []) this.addMover(m);
    for (const s of def.spinners || []) this.addSpinner(s);
    for (const p of def.powerups || []) this.powerups.push({ x: p.x, y: p.y, active: true, respawnAt: 0 });

    // Static surfaces open hands can shove against.
    this.pushables = [
      ...this.solids.filter((s) => !s.deadly).map((s) => s.body),
      ...this.movers.map((m) => m.body),
      ...this.spinners.map((s) => s.body),
    ];
  }

  addSolid(s) {
    const deadly = !!s.deadly;
    const body = M.Bodies.rectangle(s.x, s.y, s.w, s.h, {
      isStatic: true,
      angle: s.angle || 0,
      friction: 0.9,
      restitution: 0,
      collisionFilter: { category: CAT.SOLID, mask: 0xffff },
      plugin: { hh: { type: deadly ? 'deadly' : 'solid', grab: !deadly && s.grab !== false } },
    });
    M.Composite.add(this.engine.world, body);
    const rec = { body, w: s.w, h: s.h, deadly, spikeDir: s.spikeDir || 'up', color: s.color };
    this.solids.push(rec);
    if (deadly) this.deadlyBodies.push(body);
  }

  addRope(r) {
    const spacing = 20, segR = 6;
    const count = Math.max(3, Math.round(r.len / spacing));
    const segs = [];
    const composites = [];
    for (let i = 0; i < count; i++) {
      const seg = M.Bodies.circle(r.x, r.y + spacing * (i + 1), segR, {
        density: 0.002,
        frictionAir: 0.04,
        collisionFilter: { category: CAT.ROPE, mask: CAT.SOLID },
        plugin: { hh: { type: 'rope', grab: true } },
      });
      segs.push(seg);
      composites.push(seg);
      const con = M.Constraint.create({
        bodyA: i === 0 ? null : segs[i - 1],
        pointA: i === 0 ? { x: r.x, y: r.y } : { x: 0, y: 0 },
        bodyB: seg,
        pointB: { x: 0, y: 0 },
        length: spacing,
        stiffness: 0.95,
        damping: 0.03,
      });
      composites.push(con);
    }
    M.Composite.add(this.engine.world, composites);
    this.ropes.push({ anchor: { x: r.x, y: r.y }, segs });
  }

  addMover(m) {
    const x = m.from[0], y = m.from[1];
    const body = M.Bodies.rectangle(x, y, m.w, m.h, {
      isStatic: true,
      friction: 1,
      collisionFilter: { category: CAT.SOLID, mask: 0xffff },
      plugin: { hh: { type: 'mover', grab: true } },
    });
    M.Composite.add(this.engine.world, body);
    const len = Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]) || 1;
    this.movers.push({ body, w: m.w, h: m.h, from: m.from, to: m.to, speed: m.speed, len, u: (m.phase || 0) % 2 });
  }

  addSpinner(s) {
    const thick = s.thick || 22;
    const body = M.Bodies.rectangle(s.x, s.y, s.len, thick, {
      isStatic: true,
      angle: s.phase || 0,
      friction: 0.9,
      collisionFilter: { category: CAT.SOLID, mask: 0xffff },
      plugin: { hh: { type: 'spinner', grab: true } },
    });
    M.Composite.add(this.engine.world, body);
    this.spinners.push({ body, len: s.len, thick, speed: s.speed, angle: s.phase || 0 });
  }

  spawnBalloon(bl) {
    bl.body = M.Bodies.circle(bl.home.x, bl.home.y, BALLOON_R, {
      density: 0.0005,
      frictionAir: 0.022,
      restitution: 0.6,
      collisionFilter: { category: CAT.BALLOON, mask: CAT.SOLID | CAT.PLAYER | CAT.BALLOON },
      plugin: { hh: { type: 'balloon', grab: true } },
    });
    M.Body.setVelocity(bl.body, { x: (hash01(this.balloons.indexOf(bl), Math.floor(this.time)) - 0.5) * 2, y: 0 });
    M.Composite.add(this.engine.world, bl.body);
  }

  popBalloon(bl, particles) {
    if (!bl.body) return;
    if (particles) particles.burst(bl.body.position.x, bl.body.position.y, bl.color, 12, 220);
    bl.body.plugin.hh.removed = true;
    M.Composite.remove(this.engine.world, bl.body);
    bl.body = null;
    bl.respawnAt = this.time + BALLOON_RESPAWN;
    sfx.pop();
  }

  // Bodies a hand may latch onto (players get appended by the game).
  grabbables() {
    const out = [];
    for (const s of this.solids) if (!s.deadly) out.push(s.body);
    for (const m of this.movers) out.push(m.body);
    for (const s of this.spinners) out.push(s.body);
    for (const r of this.ropes) out.push(...r.segs);
    for (const b of this.balloons) if (b.body) out.push(b.body);
    return out;
  }

  update(dt, particles, players = []) {
    this.time += dt;
    const g = this.engine.gravity;

    // moving platforms ping-pong along their path
    for (const m of this.movers) {
      m.u = (m.u + (dt * m.speed) / m.len) % 2;
      const t = m.u <= 1 ? m.u : 2 - m.u;
      const e = t * t * (3 - 2 * t); // smoothstep for gentle turnarounds
      M.Body.setPosition(m.body, {
        x: lerp(m.from[0], m.to[0], e),
        y: lerp(m.from[1], m.to[1], e),
      }, true);
    }

    for (const s of this.spinners) {
      s.angle += s.speed * dt;
      M.Body.setAngle(s.body, s.angle, true);
    }

    // Balloons hover in place until someone grabs on; held they lift one
    // player gently — two players are too heavy and sink.
    for (const bl of this.balloons) {
      if (!bl.body) {
        if (this.time >= bl.respawnAt) this.spawnBalloon(bl);
        continue;
      }
      const b = bl.body;
      let held = false;
      for (const p of players) {
        for (const a of p.arms) if (a.grab && a.grab.body === b) held = true;
      }
      const lift = held
        ? (b.mass + 1.3 * REF_PLAYER_MASS) * g.y * g.scale
        : b.mass * g.y * g.scale * (1 + Math.sin(this.time * 2 + bl.home.x) * 0.35);
      M.Body.applyForce(b, b.position, { x: 0, y: -lift });
      if (b.velocity.y < -5.5) M.Body.setVelocity(b, { x: b.velocity.x, y: -5.5 });
      if (b.position.y < -BALLOON_R * 2 || b.position.x < -80 || b.position.x > this.w + 80) {
        this.popBalloon(bl, particles);
      }
    }

    for (const p of this.powerups) {
      if (!p.active && this.time >= p.respawnAt) p.active = true;
    }
  }

  // ----------------------------------------------------------------- drawing

  drawBackground(ctx, cw, ch) {
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, this.def.bg[0]);
    grad.addColorStop(1, this.def.bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    // sparse decorative dots (stars / motes), deterministic per level
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 40; i++) {
      const x = hash01(i, 1) * cw, y = hash01(i, 2) * ch;
      const r = 1 + hash01(i, 3) * 2.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }

  draw(ctx) {
    const accent = this.def.accent;

    // hint texts
    for (const t of this.def.texts || []) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.font = `bold ${t.size || 26}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }

    if (this.goal) this.drawGoal(ctx);

    // ropes
    for (const r of this.ropes) {
      ctx.strokeStyle = '#caa268';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r.anchor.x, r.anchor.y);
      for (const s of r.segs) ctx.lineTo(s.position.x, s.position.y);
      ctx.stroke();
      ctx.fillStyle = '#8a6b3f';
      for (let i = 2; i < r.segs.length; i += 3) {
        const s = r.segs[i];
        ctx.beginPath(); ctx.arc(s.position.x, s.position.y, 4.5, 0, TAU); ctx.fill();
      }
      // anchor plate
      ctx.fillStyle = '#3c4252';
      ctx.beginPath(); ctx.arc(r.anchor.x, r.anchor.y, 7, 0, TAU); ctx.fill();
    }

    // solids
    for (const s of this.solids) {
      if (s.deadly) this.drawDeadly(ctx, s);
      else this.drawPlatform(ctx, s.body, s.w, s.h, s.color || this.def.plat);
    }

    // movers
    for (const m of this.movers) {
      this.drawPlatform(ctx, m.body, m.w, m.h, this.def.plat, accent);
    }

    // spinners
    for (const s of this.spinners) {
      const b = s.body;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      roundRectPath(ctx, -s.len / 2, -s.thick / 2, s.len, s.thick, s.thick / 2);
      ctx.fillStyle = '#6a7288';
      ctx.fill();
      ctx.strokeStyle = '#3c4252';
      ctx.lineWidth = 3;
      ctx.stroke();
      // end caps in accent
      for (const e of [-1, 1]) {
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(e * (s.len / 2 - s.thick / 2), 0, s.thick / 2 - 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // hub
      ctx.fillStyle = '#2b2f3c';
      ctx.beginPath(); ctx.arc(b.position.x, b.position.y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b8c0d4';
      ctx.beginPath(); ctx.arc(b.position.x, b.position.y, 4, 0, TAU); ctx.fill();
    }

    // balloons
    for (const bl of this.balloons) {
      if (!bl.body) continue;
      const b = bl.body;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.fillStyle = bl.color;
      ctx.beginPath(); ctx.arc(0, 0, BALLOON_R, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(-8, -9, 7, 4.5, -0.6, 0, TAU); ctx.fill();
      // knot + string
      ctx.fillStyle = bl.color;
      ctx.beginPath();
      ctx.moveTo(-4, BALLOON_R - 1); ctx.lineTo(4, BALLOON_R - 1); ctx.lineTo(0, BALLOON_R + 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, BALLOON_R + 6);
      ctx.quadraticCurveTo(5, BALLOON_R + 16, -2, BALLOON_R + 26);
      ctx.stroke();
      ctx.restore();
    }

    // power-ups
    for (const p of this.powerups) {
      if (!p.active) continue;
      const bob = Math.sin(this.time * 2.4 + p.x) * 5;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // little fist
      ctx.fillStyle = '#ffd94d';
      roundRectPath(ctx, -9, -8, 15, 16, 5);
      ctx.fill();
      ctx.fillStyle = '#e0b32e';
      roundRectPath(ctx, -12, -5, 5, 10, 2);
      ctx.fill();
      ctx.strokeStyle = '#b98f14';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-2 + i * 4.5, -8); ctx.lineTo(-2 + i * 4.5, -3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawPlatform(ctx, body, w, h, color, accent) {
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(8, h / 3));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // top highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 7, -h / 2 + 2.5);
    ctx.lineTo(w / 2 - 7, -h / 2 + 2.5);
    ctx.stroke();
    if (accent) {
      // moving platforms get accent side stripes
      ctx.fillStyle = accent;
      roundRectPath(ctx, -w / 2 + 3, -h / 2 + 3, 7, h - 6, 3);
      ctx.fill();
      roundRectPath(ctx, w / 2 - 10, -h / 2 + 3, 7, h - 6, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  drawDeadly(ctx, s) {
    const color = this.def.hazard || '#ff4757';
    const b = s.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    // spike teeth along the hazardous edge
    ctx.fillStyle = color;
    const step = 26, spikeH = 15;
    if (s.spikeDir === 'up' || s.spikeDir === 'down') {
      const sign = s.spikeDir === 'up' ? -1 : 1;
      const edge = (s.h / 2) * sign;
      for (let x = -s.w / 2; x < s.w / 2 - 1; x += step) {
        const w = Math.min(step, s.w / 2 - x);
        ctx.beginPath();
        ctx.moveTo(x, edge);
        ctx.lineTo(x + w / 2, edge + sign * spikeH);
        ctx.lineTo(x + w, edge);
        ctx.closePath();
        ctx.fill();
      }
      // glowing strip
      ctx.fillRect(-s.w / 2, edge - (sign > 0 ? 0 : 4), s.w, 4);
    }
    ctx.restore();
  }

  drawGoal(ctx) {
    const g = this.goal;
    const pulse = 1 + Math.sin(this.time * 3) * 0.06;
    // beam
    const grad = ctx.createLinearGradient(0, g.y - 130, 0, g.y + g.r);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = grad;
    ctx.fillRect(g.x - g.r * 0.8, g.y - 130, g.r * 1.6, 130 + g.r);
    // ring
    ctx.strokeStyle = this.def.accent;
    ctx.lineWidth = 6;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r * pulse, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // flag
    ctx.strokeStyle = '#d8dce8';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(g.x, g.y + g.r); ctx.lineTo(g.x, g.y - 8); ctx.stroke();
    const wave = Math.sin(this.time * 5) * 4;
    ctx.fillStyle = this.def.accent;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - 8);
    ctx.quadraticCurveTo(g.x + 18, g.y - 14 + wave, g.x + 34, g.y - 6 + wave);
    ctx.lineTo(g.x + 34, g.y + 12 + wave);
    ctx.quadraticCurveTo(g.x + 18, g.y + 4 + wave, g.x, g.y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', g.x, g.y - g.r - 14);
  }
}
