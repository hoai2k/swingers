// Waypoints: a glowing, spinning gold star (with a beam of light up to the sky, seen from afar)
// stands at key places round the archipelago. Touching it (body or hands) collects it with a
// fanfare, confetti and a sparkle ring, and the place becomes a waypoint everyone can fast-travel
// to: from the world map (map.js: LB / RB pick a discovered star, Y travels) or the pause menu
// ("Fast travel ◀ place ▶", ui.js). Found ids are saved in settings.waypoints.
// Town is a waypoint from the start (no star): there is always somewhere to go back to.
import * as THREE from 'three';
import { settings, saveSettings } from '../settings.js';
import { chime, groundAt } from './common.js';
import { confetti } from './presents.js';
import { FUN_DX, FUN_DZ, SEA_LEVEL } from '../config.js';

// [id, name, x, z]: the star stands on the nearest open ground (sky above, dry, level) to (x, z)
export const WAYPOINTS = [
  ['town', 'Town', 0, 8, { start: true }],
  ['beach', 'Beach', -40, 330], ['lighthouse', 'Lighthouse', 205, 228], ['pool', 'Swimming Pool', 88, 112],
  ['playground', 'Playground', 105, -95], ['stunt', 'Stunt Park', -105, 95], ['karts', 'Kart Track', 242, 20],
  ['farm', 'Farm', 200, -150], ['summit', 'Mountain Lookout', 60, -262], ['lake', 'Lake Camp', -140, -165],
  ['factory', 'Wobble Works', -245, -115], ['berryfarm', 'Pooh Berry Farm', -240, 62], ['fair', 'Fall Fair', 0, 158],
  ['funpark', 'Fun Park', -230 + FUN_DX, -10 + FUN_DZ],
  ['bigtown', 'Central Plaza', 875, -14], ['stadium', 'Stadium', 840, -240], ['citypark', 'City Park', 1060, -215],
  ['skivillage', 'Ski Village', 0, -790], ['frostpeak', 'Frostpeak Summit', -40, -1165],
  ['dustville', 'Dustville', -960, -30], ['oasis', 'Oasis', -935, 205], ['pyramid', 'Old Pyramid', -1240, -75],
  ['stiltvillage', 'Stilt Village', -405, 765], ['temple', 'Temple Ruins', -540, 680], ['volcano', 'Volcano Rim', -690, 868],
  ['resort', 'Resort Isle', 605, 762], ['harbour', 'Harbour Isle', 470, 640],
];
const SHOW_R = 260, BEAM_R = 700; // star drawn within SHOW_R of a camera, its light beam within BEAM_R

function starGeometry() {
  const shape = new THREE.Shape(), R = 0.55, r = 0.24;
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r : R;
    i ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3 });
  g.center();
  return g;
}
function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,248,200,0.9)'); gr.addColorStop(0.25, 'rgba(255,225,120,0.5)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function beamTexture() {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,230,140,0)'); gr.addColorStop(0.7, 'rgba(255,230,140,0.35)'); gr.addColorStop(1, 'rgba(255,240,180,0.7)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
  const gx = g.createLinearGradient(0, 0, 32, 0); // soft sides
  gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWaypoints(game) {
  const found = new Set((settings.waypoints || []).filter((id) => WAYPOINTS.some((w) => w[0] === id)));
  const burst = confetti(game);
  const starGeo = starGeometry();
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.35 });
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.PlaneGeometry(1.4, 60); beamGeo.translate(0, 30, 0);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  game.physics.world.updateSceneQueries?.();

  // the nearest open, dry, level ground to (x, z): sky straight above it (no roof, canopy or ride)
  const ok = (x, z) => {
    const t = groundAt(x, z), y = game.groundHeight(x, z, t + 120);
    if (y - t > 0.8 || y - t < -0.35 || y < SEA_LEVEL + 0.3) return null;   // (paving / a pitch may sit a little above the terrain)
    const wl = game.physics.waterLevel?.(x, y + 0.3, z);
    if (wl != null && wl > y - 0.1) return null;                          // in a pool / pond / the sea
    for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) if (Math.abs(groundAt(x + dx, z + dz) - t) > 0.7) return null;
    return y;
  };
  const spot = (x, z) => {
    for (let r = 0; r <= 40; r += 2.5) {
      const n = r ? Math.max(8, Math.round(r * 1.2)) : 1;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, y = ok(px, pz);
        if (y != null) return { x: px, y, z: pz };
      }
    }
    return { x, y: game.groundHeight(x, z, groundAt(x, z) + 120), z, miss: true };
  };

  const list = WAYPOINTS.map(([id, name, x0, z0, o = {}], i) => {
    const s = spot(x0, z0);
    const w = { id, name, i, x: s.x, y: s.y, z: s.z, miss: s.miss, start: !!o.start, found: !!o.start || found.has(id), group: null };
    if (w.start) return w;
    const g = new THREE.Group();
    g.position.set(w.x, w.y, w.z);
    const star = new THREE.Mesh(starGeo, starMat); star.position.y = 1.5; star.scale.setScalar(1.3);
    const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(2.6); glow.position.y = 1.5;
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = 1.5;
    const beam2 = new THREE.Mesh(beamGeo, beamMat); beam2.position.y = 1.5; beam2.rotation.y = Math.PI / 2;
    g.add(star, glow, beam, beam2);
    g.userData.noCull = true;
    g.visible = false;
    game.scene.add(g);
    Object.assign(w, { group: g, star, glow, beams: [beam, beam2] });
    return w;
  });

  // sparkle rings: a gold ring that grows and fades where a star was taken
  const rings = [];
  const ringBurst = (pos) => {
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.position.copy(pos); m.position.y += 0.2 + k * 0.5; m.userData.noCull = true;
      game.scene.add(m); rings.push({ m, t: -k * 0.12 });
    }
  };

  // touch check, 20 times a second: chest within 1.2 m of the star or a hand within 0.6 m
  const hand = new THREE.Vector3(), c = new THREE.Vector3();
  let tick = 0;
  game.steppers.push(() => {
    if (tick++ % 3) return;
    for (const w of list) {
      if (w.found) continue;
      c.set(w.x, w.y + 1.5, w.z);
      for (const p of game.players) {
        const t = p.chest.translation();
        if (Math.abs(t.x - c.x) > 3 || Math.abs(t.z - c.z) > 3) continue;
        let hit = Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z) < 1.2;
        if (!hit && p.handPos) for (const h of ['L', 'R']) if (p.handPos(h, hand).distanceTo(c) < 0.6) { hit = true; break; }
        if (hit) { collect(w, p); break; }
      }
    }
  });

  function collect(w, p) {
    w.found = true; w.group.visible = false;
    settings.waypoints = list.filter((q) => q.found && !q.start).map((q) => q.id); saveSettings();
    const pos = new THREE.Vector3(w.x, w.y + 1.5, w.z);
    burst(pos); burst(pos);
    ringBurst(new THREE.Vector3(w.x, w.y, w.z));
    game.audio?.play('pop', pos);
    if (!game.audio?.samples?.star?.length) {
      chime(game, pos, [76, 79, 83, 88], 0.22);
      setTimeout(() => chime(game, pos, [91, 95, 100], 0.12), 380);
    } else game.audio.play('star', pos);
    game.wallet?.add(p, 15, 'Waypoint found');
    const n = list.filter((q) => q.found && !q.start).length, total = list.filter((q) => !q.start).length;
    game.ui?.toast(`⭐ P${p.index + 1} discovered <b>${w.name}</b>! Fast travel there from the map. <small>${n}/${total}</small>`, p.color);
    for (const pn of game.ui?.panels?.values?.() || []) pn.draw?.();
  }

  // spin, bob and pulse; drawn only near some camera
  game.updaters.push((dt, t) => {
    const cams = game.players.map((p) => p.camera?.cam?.position).filter(Boolean);
    for (const w of list) {
      if (!w.group || w.found) continue;
      let d2 = Infinity;
      for (const cp of cams) d2 = Math.min(d2, (cp.x - w.x) ** 2 + (cp.z - w.z) ** 2);
      w.group.visible = d2 < BEAM_R * BEAM_R;
      if (!w.group.visible) continue;
      const close = d2 < SHOW_R * SHOW_R;
      w.star.visible = w.glow.visible = close;
      w.star.rotation.y = t * 1.8 + w.i;
      w.star.position.y = w.glow.position.y = 1.5 + Math.sin(t * 2 + w.i) * 0.15;
      w.glow.scale.setScalar(2.4 + Math.sin(t * 4 + w.i) * 0.3);
      for (const b of w.beams) b.scale.x = 1 + Math.sqrt(d2) / 120;  // stays visible as a thin line far away
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt;
      if (r.t < 0) { r.m.visible = false; continue; }
      r.m.visible = true;
      const k = r.t / 0.9;
      r.m.scale.setScalar(0.5 + k * 4.5); r.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { game.scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
    }
  });

  const api = game.waypoints = {
    list,
    discovered: () => list.filter((w) => w.found),
    // fast travel: stand beside the star's spot, facing it
    travel(p, w) {
      if (p.seat) p.leaveSeat?.();
      const a = w.i * 2.4, x = w.x + Math.sin(a) * 2.5, z = w.z + Math.cos(a) * 2.5;
      const y = game.groundHeight(x, z, w.y + 4);
      p.teleport(x, Math.max(y, w.y) + 1.1, z, Math.atan2(w.x - x, w.z - z));
      if (p.camera) { p.camera.yaw = Math.atan2(w.x - x, w.z - z); p.camera.first = true; }
      game.pets?.of(p)?.teleportNear();
      game.audio?.play('pop', p.pos());
      game.ui?.toast(`P${p.index + 1} travelled to ${w.name}`, p.color);
    },
    reset() {
      settings.waypoints = []; saveSettings();
      for (const w of list) if (!w.start) { w.found = false; }
    },
  };
  return api;
}
