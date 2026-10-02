// Level construction + simulation + rendering.
//
// A level definition (see levels.js) is plain data:
//   { name, intro, w, h, bg:[top,bottom], plat, accent, hazard?,
//     spawn:{x,y}, goal:{x,y,r},
//     solids:  [{x,y,w,h, angle?, deadly?, spikeDir?, grab?, color?,
//                ice?, bounce?, crumble?}]  (x,y = center)
//                ice:     slick AND ungrabbable — hands slide off, bodies skid
//                bounce:  trampoline; launches a landing body along the
//                         pad's normal at this speed (px/tick, ~12-22)
//                crumble: cracks when touched or gripped, falls away after
//                         a beat (true = 0.85s, or a number of seconds),
//                         grows back a few seconds later
//     ropes:   [{x,y,len}]
//     balloons:[{x,y}]
//     movers:  [{w,h, from:[x,y], to:[x,y], speed, phase?}]
//     spinners:[{x,y,len,thick?,speed,phase?}]
//     powerups:[{x,y}]
//     winds:   [{x,y,w,h, fx,fy, period?,on?,phase?}]
//                                   gust zones (x,y = center); fx/fy are the
//                                   push in robot body-weights (fy -1.3 = an
//                                   updraft that lifts a robot). With a
//                                   period the gust blows for `on` seconds
//                                   of every `period` (streaks flicker as a
//                                   warning just before it starts)
//     checkpoints:[{x,y}]           touch the flag and you respawn there
//     texts:   [{x,y,text,size?}] }
// Everything solid is grabbable unless deadly or grab:false.

import { clamp, lerp, TAU, hash01, roundRectPath } from './util.js';
import { CAT } from './player.js';
import { sfx } from './audio.js';
import { art, pattern } from './art.js';

const TILE_K = 0.42;        // platform tiles: 512x128 drawn ~215x54 (rim ~9px)
const TILE_RIM = 128 * TILE_K;

const M = window.Matter;

const BALLOON_R = 24;
const BALLOON_COLORS = ['#ff8fb3', '#8fd0ff', '#fff09e', '#b9f0b0'];
// Full player mass including both physical arm chains (body ~2.2 + arms ~1.3);
// balloon buoyancy is budgeted against this so one robot rises, two sink.
const REF_PLAYER_MASS = 3.5;
const POWERUP_RESPAWN = 9;
const BALLOON_RESPAWN = 3.5;
const CRUMBLE_DELAY = 0.85;   // seconds of cracking before a block falls
const CRUMBLE_REGROW = 3.2;   // seconds until it grows back
const BOUNCE_COOLDOWN = 0.3;

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
    this.bouncers = [];    // solid recs with .bounce
    this.bounceCd = new Map();   // player -> time their next bounce may fire
    this.crumbles = [];    // solid recs with .crumble state
    this.winds = (def.winds || []).map((w) => ({ ...w }));
    this.checkpoints = (def.checkpoints || []).map((c) => ({ x: c.x, y: c.y, color: null, raise: 0 }));
    this.debris = [];      // falling crumble chunks (visual only)

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
    const ice = !deadly && !!s.ice;
    const bounce = !deadly && s.bounce ? s.bounce : 0;
    const body = M.Bodies.rectangle(s.x, s.y, s.w, s.h, {
      isStatic: true,
      angle: s.angle || 0,
      friction: ice ? 0.015 : 0.9,
      frictionStatic: ice ? 0.02 : 0.5,
      restitution: 0,
      collisionFilter: { category: CAT.SOLID, mask: 0xffff },
      plugin: { hh: { type: deadly ? 'deadly' : 'solid', grab: !deadly && !ice && !bounce && s.grab !== false } },
    });
    M.Composite.add(this.engine.world, body);
    const rec = {
      body, w: s.w, h: s.h, deadly, spikeDir: s.spikeDir || 'up', color: s.color,
      slick: !deadly && !bounce && (ice || s.grab === false), ice, bounce,
    };
    this.solids.push(rec);
    if (deadly) this.deadlyBodies.push(body);
    if (bounce) { rec.squash = 0; this.bouncers.push(rec); }
    if (!deadly && s.crumble) {
      rec.crumble = { state: 'solid', t: 0, delay: typeof s.crumble === 'number' ? s.crumble : CRUMBLE_DELAY };
      this.crumbles.push(rec);
    }
  }

  addRope(r) {
    const spacing = 20, segR = 6;
    const count = Math.max(3, Math.round(r.len / spacing));
    const segs = [];
    const composites = [];
    for (let i = 0; i < count; i++) {
      // Ropes must SWING (it's the marquee mechanic): near-zero air drag and
      // undamped, fully stiff links keep pendulum energy alive, and each
      // segment carries a backref to the chain so the grip motor can resolve
      // swing loads against the anchor (see player.js).
      const seg = M.Bodies.circle(r.x, r.y + spacing * (i + 1), segR, {
        density: 0.002,
        frictionAir: 0.006,
        collisionFilter: { category: CAT.ROPE, mask: CAT.SOLID },
        plugin: { hh: { type: 'rope', grab: true, ropeSegs: segs, ropeIndex: i } },
      });
      segs.push(seg);
      composites.push(seg);
      const con = M.Constraint.create({
        bodyA: i === 0 ? null : segs[i - 1],
        pointA: i === 0 ? { x: r.x, y: r.y } : { x: 0, y: 0 },
        bodyB: seg,
        pointB: { x: 0, y: 0 },
        length: spacing,
        stiffness: 1,
        damping: 0.005,
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

    const alive = players.filter((p) => p.state === 'alive');
    this.updateBouncers(dt, particles, alive);
    this.updateCrumbles(dt, particles, alive);
    this.updateWinds(alive);
    this.updateCheckpoints(particles, alive);
    for (const d of this.debris) {
      d.vy += 1600 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.spin * dt; d.life -= dt;
    }
    this.debris = this.debris.filter((d) => d.life > 0);
  }

  // Trampolines: a body that lands on the pad's face is relaunched along the
  // pad's normal at its fixed speed (velocity along the face is kept, so a
  // running landing becomes a long arc). Deterministic on purpose — the same
  // bounce every time is what lets boards be designed around it.
  updateBouncers(dt, particles, players) {
    for (const r of this.bouncers) {
      r.squash = Math.max(0, r.squash - dt * 5);
      const b = r.body;
      const n = { x: Math.sin(b.angle), y: -Math.cos(b.angle) };
      for (const p of players) {
        if ((this.bounceCd.get(p) || 0) > this.time) continue;
        const pb = p.body;
        const rel = { x: pb.position.x - b.position.x, y: pb.position.y - b.position.y };
        const along = rel.x * n.y * -1 + rel.y * n.x;   // offset along the face
        const out = rel.x * n.x + rel.y * n.y;          // height above the center
        if (Math.abs(along) > r.w / 2 + 6) continue;
        if (out < r.h / 2 || out > r.h / 2 + 21 + 4) continue;   // touching the face
        const vn = pb.velocity.x * n.x + pb.velocity.y * n.y;
        if (vn > r.bounce * 0.5) continue;              // already flying off
        const v = {
          x: pb.velocity.x - vn * n.x + r.bounce * n.x,
          y: pb.velocity.y - vn * n.y + r.bounce * n.y,
        };
        p.releaseAll();
        // kick the whole rig (arms too) — launching only the body would
        // share its momentum with the dangling arms and fizzle
        const dv = { x: v.x - pb.velocity.x, y: v.y - pb.velocity.y };
        for (const rb of p.rigBodies) {
          M.Body.setVelocity(rb, { x: rb.velocity.x + dv.x, y: rb.velocity.y + dv.y });
        }
        this.bounceCd.set(p, this.time + BOUNCE_COOLDOWN);
        r.squash = 1;
        if (particles) particles.ring(pb.position.x, pb.position.y + 14, 30, this.def.accent, 0.3);
        sfx.boing();
      }
    }
  }

  // Crumbling blocks: touched (stood on, gripped) -> crack -> fall away ->
  // grow back. Hands on a vanished block let go on their own (player.js
  // releases grips on bodies flagged removed).
  updateCrumbles(dt, particles, players) {
    for (const r of this.crumbles) {
      const c = r.crumble, b = r.body;
      if (c.state === 'solid') {
        if (this.touchedBy(r, players)) { c.state = 'cracking'; c.t = c.delay; sfx.crack(); }
      } else if (c.state === 'cracking') {
        c.t -= dt;
        if (c.t <= 0) {
          c.state = 'gone'; c.t = CRUMBLE_REGROW;
          b.plugin.hh.removed = true;
          M.Composite.remove(this.engine.world, b);
          for (let i = 0; i < 6; i++) {
            this.debris.push({
              x: b.position.x + (hash01(i, this.time * 7) - 0.5) * r.w,
              y: b.position.y + (hash01(i, this.time * 3 + 1) - 0.5) * r.h,
              w: r.w / 4, h: r.h * 0.7, vx: (hash01(i, 9) - 0.5) * 120, vy: -60,
              rot: 0, spin: (hash01(i, 4) - 0.5) * 6, life: 1.2,
            });
          }
          if (particles) particles.dust(b.position.x, b.position.y, 10);
          sfx.crumble();
        }
      } else if (c.state === 'gone') {
        c.t -= dt;
        // don't grow back inside someone
        if (c.t <= 0 && !players.some((p) => this.overlapsRec(r, p.body, 4))) {
          c.state = 'solid';
          b.plugin.hh.removed = false;
          M.Composite.add(this.engine.world, b);
        }
      }
    }
  }

  overlapsRec(r, body, pad) {
    const b = r.body.bounds, o = body.bounds;
    return o.max.x > b.min.x - pad && o.min.x < b.max.x + pad &&
      o.max.y > b.min.y - pad && o.min.y < b.max.y + pad;
  }

  touchedBy(r, players) {
    for (const p of players) {
      if (this.overlapsRec(r, p.body, 3)) return true;
      for (const a of p.arms) if (a.grab && a.grab.body === r.body) return true;
    }
    return false;
  }

  // Gust zones push robots (and loose balloons) — forces are in body
  // weights of a whole robot rig so a zone reads the same on any board.
  updateWinds(players) {
    if (!this.winds.length) return;
    const g = this.engine.gravity;
    const W = REF_PLAYER_MASS * g.y * g.scale;
    const inside = (w, pt) => Math.abs(pt.x - w.x) < w.w / 2 && Math.abs(pt.y - w.y) < w.h / 2;
    for (const w of this.winds) {
      const k0 = this.windStrength(w);
      if (k0 <= 0) continue;
      for (const p of players) {
        if (inside(w, p.body.position)) M.Body.applyForce(p.body, p.body.position, { x: w.fx * W * k0, y: w.fy * W * k0 });
      }
      for (const bl of this.balloons) {
        const b = bl.body;
        if (!b || !inside(w, b.position)) continue;
        const held = players.some((p) => p.arms.some((a) => a.grab && a.grab.body === b));
        if (held) continue;   // the rider already feels the gust
        const k = b.mass * g.y * g.scale * 1.5 * k0;
        M.Body.applyForce(b, b.position, { x: w.fx * k, y: w.fy * k });
      }
    }
  }

  // 0..1 gust strength right now (always 1 for a steady zone)
  windStrength(w) {
    if (!w.period) return 1;
    const t = (this.time + (w.phase || 0)) % w.period;
    const on = w.on || w.period / 2, ramp = 0.35;
    if (t > on) return 0;
    return Math.min(1, t / ramp, (on - t) / ramp);
  }

  // seconds until a pulsing gust starts (Infinity if it's steady/blowing)
  windWarning(w) {
    if (!w.period) return Infinity;
    const t = (this.time + (w.phase || 0)) % w.period;
    const on = w.on || w.period / 2;
    return t > on ? w.period - t : Infinity;
  }

  updateCheckpoints(particles, players) {
    for (const c of this.checkpoints) {
      c.raise = Math.min(1, c.raise + (c.color ? 0.04 : 0));
      for (const p of players) {
        const d = Math.hypot(p.body.position.x - c.x, p.body.position.y - c.y);
        if (d > 52) continue;
        if (p.spawnPoint.x === c.x && p.spawnPoint.y === c.y) continue;
        p.spawnPoint = { x: c.x, y: c.y };
        if (c.color !== p.color.main) { c.color = p.color.main; c.raise = 0; }
        if (particles) particles.burst(c.x, c.y - 40, p.color.main, 10, 160);
        sfx.checkpoint();
      }
    }
  }

  // ----------------------------------------------------------------- drawing

  drawBackground(ctx, cw, ch) {
    const img = art('bg:' + this.def.theme);
    if (img) {
      // painted backdrop, cover-fit to the whole canvas (letterbox included)
      // with a slow drift so the room breathes
      const s = Math.max(cw / img.width, ch / img.height) * 1.04;
      const dw = img.width * s, dh = img.height * s;
      const drift = Math.sin(this.time * 0.07) * (dw - cw) * 0.4;
      ctx.drawImage(img, (cw - dw) / 2 + drift, (ch - dh) / 2, dw, dh);
      // dim toward the theme's sky color so platforms, hazards and robots
      // stay the brightest things on screen
      const dim = ctx.createLinearGradient(0, 0, 0, ch);
      dim.addColorStop(0, this.def.bg[0] + '8c');
      dim.addColorStop(1, this.def.bg[0] + '40');
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, cw, ch);
      return;
    }
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

    for (const w of this.winds) this.drawWind(ctx, w);
    for (const c of this.checkpoints) this.drawCheckpoint(ctx, c);
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
      else if (s.bounce) this.drawBouncer(ctx, s);
      else if (s.crumble) this.drawCrumble(ctx, s);
      else this.drawPlatform(ctx, s.body, s.w, s.h, s.color || this.def.plat, null, s.slick);
    }
    for (const d of this.debris) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life * 2);
      ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.fillStyle = this.def.plat;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.restore();
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

  // Fill the current local-frame rect with the theme's platform tile: the
  // tile's top band (rim: grass, snow, frosting...) along the top edge, its
  // body material repeated below. Returns false if the tile isn't loaded.
  fillTiled(ctx, w, h) {
    const key = 'plat:' + this.def.theme;
    const full = pattern(ctx, key);
    const body = pattern(ctx, key, [0, 48, 512, 80]);
    if (!full || !body) return false;
    const m = new DOMMatrix().translate(-w / 2, -h / 2).scale(TILE_K);
    full.setTransform(m);
    ctx.fillStyle = full;
    ctx.fillRect(-w / 2, -h / 2, w, Math.min(h, TILE_RIM));
    if (h > TILE_RIM) {
      body.setTransform(new DOMMatrix().translate(-w / 2, -h / 2 + TILE_RIM).scale(TILE_K));
      ctx.fillStyle = body;
      ctx.fillRect(-w / 2, -h / 2 + TILE_RIM, w, h - TILE_RIM);
    }
    return true;
  }

  drawPlatform(ctx, body, w, h, color, accent, slick) {
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(8, h / 3));
    ctx.fillStyle = color;
    ctx.fill();
    let textured = false;
    if (!slick) {
      ctx.save();
      ctx.clip();
      textured = this.fillTiled(ctx, w, h);
      ctx.restore();
      roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(8, h / 3));
    }
    if (slick) {
      // slippery (ungrabbable): darker, with an icy diagonal sheen — hands
      // slide right off, and it should read that way
      ctx.save();
      ctx.clip();
      // glassy pale ice — clearly not the textured, grippable stone
      const ig = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      ig.addColorStop(0, '#d8f3ff');
      ig.addColorStop(1, '#6fb3d6');
      ctx.fillStyle = ig;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 5;
      const step = 46;
      for (let d = -h; d < w + h; d += step) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + d, -h / 2);
        ctx.lineTo(-w / 2 + d - h, h / 2);
        ctx.stroke();
      }
      ctx.restore();
      // the sheen loop replaced the current path — rebuild the outline
      roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(8, h / 3));
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // top highlight (grabbable surfaces only — the gloss reads as grip)
    if (!slick && !textured) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 7, -h / 2 + 2.5);
      ctx.lineTo(w / 2 - 7, -h / 2 + 2.5);
      ctx.stroke();
    }
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

  drawBouncer(ctx, s) {
    const b = s.body;
    const sq = s.squash * s.squash;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    // base block
    roundRectPath(ctx, -s.w / 2, -s.h / 2 + 6, s.w, s.h - 6, 6);
    ctx.fillStyle = '#2b2f3c';
    ctx.fill();
    // springs
    ctx.strokeStyle = '#b8c0d4';
    ctx.lineWidth = 3;
    const top = -s.h / 2 + 6 - (1 - sq) * 6;
    for (const fx of [-0.3, 0.3]) {
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const y = lerp(top, -s.h / 2 + 8, i / 6);
        ctx.lineTo(fx * s.w + (i % 2 ? 6 : -6), y);
      }
      ctx.stroke();
    }
    // the springy pad
    roundRectPath(ctx, -s.w / 2 - 2, top - 9, s.w + 4, 11, 5);
    ctx.fillStyle = this.def.accent;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // up-chevrons
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    const bob = (this.time * 1.5) % 1;
    ctx.globalAlpha = 1 - bob;
    for (const k of [0, 1]) {
      const y = top - 22 - bob * 14 - k * 10;
      ctx.beginPath(); ctx.moveTo(-9, y + 6); ctx.lineTo(0, y); ctx.lineTo(9, y + 6); ctx.stroke();
    }
    ctx.restore();
  }

  drawCrumble(ctx, s) {
    const c = s.crumble, b = s.body;
    if (c.state === 'gone') {
      // ghost outline that fills in as it regrows
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
      ctx.setLineDash([]);
      const f = 1 - Math.max(0, c.t) / CRUMBLE_REGROW;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(-s.w / 2, s.h / 2 - s.h * f, s.w, s.h * f);
      ctx.restore();
      return;
    }
    const shake = c.state === 'cracking' ? (1 - c.t / c.delay) * 3 : 0;
    ctx.save();
    ctx.translate(
      b.position.x + (shake ? Math.sin(this.time * 60) * shake : 0),
      b.position.y + (shake ? Math.cos(this.time * 47) * shake * 0.5 : 0),
    );
    ctx.rotate(b.angle);
    // chunky bricks
    const n = Math.max(2, Math.round(s.w / 34));
    const bw = s.w / n;
    for (let i = 0; i < n; i++) {
      roundRectPath(ctx, -s.w / 2 + i * bw + 1, -s.h / 2, bw - 2, s.h, 4);
      ctx.fillStyle = s.color || this.def.plat;
      ctx.fill();
      ctx.save(); ctx.clip(); this.fillTiled(ctx, s.w, s.h); ctx.restore();
      roundRectPath(ctx, -s.w / 2 + i * bw + 1, -s.h / 2, bw - 2, s.h, 4);
      ctx.fillStyle = `rgba(0,0,0,${0.12 + hash01(i, s.w) * 0.12})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // cracks grow as it gives way
    const k = c.state === 'cracking' ? 1 - c.t / c.delay : 0.25;
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + k * 0.5})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const x0 = -s.w / 2 + (i + 0.5) * bw;
      ctx.beginPath();
      ctx.moveTo(x0, -s.h / 2);
      ctx.lineTo(x0 + (hash01(i, 2) - 0.5) * bw * 0.6, -s.h / 2 + s.h * 0.5 * k + 2);
      ctx.lineTo(x0 + (hash01(i, 5) - 0.5) * bw * 0.8, -s.h / 2 + s.h * k);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawWind(ctx, w) {
    const x0 = w.x - w.w / 2, y0 = w.y - w.h / 2;
    const m = Math.hypot(w.fx, w.fy) || 1;
    const dx = w.fx / m, dy = w.fy / m;
    const k = this.windStrength(w);
    const warn = this.windWarning(w);
    // calm: a faint outline; a gust about to start flickers as a warning
    let alpha = 0.18 + k * 0.82;
    if (warn < 0.9) alpha = Math.max(alpha, Math.floor(this.time * 10) % 2 ? 0.55 : 0.2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.rect(x0, y0, w.w, w.h); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x0, y0, w.w, w.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const speed = 260 * Math.min(1.6, m);
    const wrap = (v, n) => ((v % n) + n) % n;
    const count = Math.round((w.w * w.h) / 9000) + 4;
    for (let i = 0; i < count; i++) {
      // streaks drift along the wind, wrapping around inside the zone
      const sp = speed * (0.7 + hash01(i, 12) * 0.6);
      const px = x0 + wrap(hash01(i, 11) * w.w + this.time * sp * dx, w.w + 60) - 30;
      const py = y0 + wrap(hash01(i, 13) * w.h + this.time * sp * dy, w.h + 60) - 30;
      const len = 26 + hash01(i, 14) * 30;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - dx * len, py - dy * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCheckpoint(ctx, c) {
    const baseY = c.y + 21;            // checkpoints are placed at standing height
    ctx.strokeStyle = '#d8dce8';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c.x, baseY); ctx.lineTo(c.x, baseY - 64); ctx.stroke();
    ctx.fillStyle = '#d8dce8';
    ctx.beginPath(); ctx.arc(c.x, baseY - 64, 3.5, 0, TAU); ctx.fill();
    const top = c.color ? baseY - 62 : baseY - 30;
    const y = lerp(baseY - 30, top, c.color ? c.raise : 0);
    const wave = Math.sin(this.time * 5 + c.x) * 3;
    ctx.fillStyle = c.color || 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(c.x, y);
    ctx.lineTo(c.x + 26, y + 7 + wave);
    ctx.lineTo(c.x, y + 16);
    ctx.closePath();
    ctx.fill();
  }

  // Wide floor hazards on lava / ice boards become liquid; every other
  // deadly block gets the metal spike strip along its dangerous edge.
  drawDeadly(ctx, s) {
    const b = s.body;
    const liquid = this.def.theme === 'volcano' ? 'lava' : this.def.theme === 'frost' ? 'icewater' : null;
    if (liquid && s.spikeDir === 'up' && !b.angle && s.w >= 300 && art(liquid)) {
      this.drawLiquid(ctx, s, liquid);
      return;
    }
    if (art('spikes')) {
      this.drawSpikeStrip(ctx, s);
      return;
    }
    const color = this.def.hazard || '#ff4757';
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
    } else {
      // 'left' / 'right': teeth along a vertical edge (razor walls)
      const sign = s.spikeDir === 'left' ? -1 : 1;
      const edge = (s.w / 2) * sign;
      for (let y = -s.h / 2; y < s.h / 2 - 1; y += step) {
        const h = Math.min(step, s.h / 2 - y);
        ctx.beginPath();
        ctx.moveTo(edge, y);
        ctx.lineTo(edge + sign * spikeH, y + h / 2);
        ctx.lineTo(edge, y + h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(edge - (sign > 0 ? 4 : 0), -s.h / 2, 4, s.h);
    }
    ctx.restore();
  }

  drawLiquid(ctx, s, kind) {
    const b = s.body;
    const x0 = b.position.x - s.w / 2, top = b.position.y - s.h / 2;
    const lava = kind === 'lava';
    // heat / cold glow rising off the surface
    const glow = ctx.createLinearGradient(0, top - 120, 0, top);
    glow.addColorStop(0, lava ? 'rgba(255,110,30,0)' : 'rgba(140,220,255,0)');
    glow.addColorStop(1, lava ? 'rgba(255,110,30,0.32)' : 'rgba(140,220,255,0.16)');
    ctx.fillStyle = glow;
    ctx.fillRect(x0, top - 120, s.w, 120);
    // the texture, scrolling slowly sideways; below it, its own deep color
    const k = 0.4, th = 256 * k;
    const p = pattern(ctx, kind);
    const bob = Math.sin(this.time * 1.6) * 2;
    p.setTransform(new DOMMatrix().translate(x0 + ((this.time * (lava ? 9 : 16)) % (896 * k)), top - 8 + bob).scale(k));
    ctx.fillStyle = p;
    ctx.fillRect(x0, top - 8 + bob, s.w, th);
    ctx.fillStyle = lava ? '#2a0a06' : '#06233f';
    ctx.fillRect(x0, top - 8 + bob + th - 1, s.w, Math.max(0, this.h + 200 - (top + th)));
  }

  drawSpikeStrip(ctx, s) {
    const b = s.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = 'rgba(10,8,16,0.75)';
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    // rotate so the dangerous edge is "up" in the local frame
    const rot = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[s.spikeDir] || 0;
    ctx.rotate(rot);
    const vertical = s.spikeDir === 'left' || s.spikeDir === 'right';
    const len = vertical ? s.h : s.w, depth = vertical ? s.w : s.h;
    const H = 30, kx = 0.42, ky = H / 128;
    const p = pattern(ctx, 'spikes');
    p.setTransform(new DOMMatrix().translate(-len / 2, -depth / 2 - 16).scale(kx, ky));
    ctx.fillStyle = p;
    ctx.fillRect(-len / 2, -depth / 2 - 16, len, H);
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
