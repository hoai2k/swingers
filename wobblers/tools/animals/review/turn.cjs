// node turn.cjs '[["shark"],["crow"],...]' -> $REVIEW_DIR/tv_<key>_{0,1,2,3}.png: the game's model in side / top / 3-4 / front view
// (needs the local server on :8123; AMP=1 PH=<phase> pose the animation). See ../METHOD.md.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.REVIEW_DIR || '/tmp/animal-review'; fs.mkdirSync(OUT + '/boards', { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await pg.goto('http://localhost:8123/wobblers/');
  await pg.waitForFunction(() => window.__wob && window.__wob.ui.ready, null, { timeout: 900000 });
  await pg.waitForFunction(() => !__wob.scene.children.some((m) => m.name?.startsWith('critters_') && !m.geometry.attributes.aAnim), null, { timeout: 120000 });
  const list = JSON.parse(process.argv[2]);
  await pg.evaluate(([a, b]) => { window.__PH = a; window.__AMP = b; }, [+(process.env.PH || 0), +(process.env.AMP || 0)]);
  const shots = await pg.evaluate(async (list) => {
    const g = __wob, THREE = await import('three'); g.manual = true; g.frame = () => {}; g.daySpeed = 0; g.setTimeOfDay(12);
    const W = 640, H = 360, cam = new THREE.PerspectiveCamera(18, W / H, 0.05, 2000), out = {};
    g.scene.fog.near = 1500; g.scene.fog.far = 2000;
    g.scene.traverse((o) => { if (o.isHemisphereLight) { o.groundColor.set(0x8a8a90); } });
    const C = new THREE.Vector3(3000, 300, 3000);
    const bg = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 8), new THREE.MeshBasicMaterial({ color: 0xc8c8cc, side: THREE.BackSide, fog: false })); bg.position.copy(C); g.scene.add(bg);
    for (const key of list) {
      const msh = g.scene.getObjectByName('critters_' + key); if (!msh) { out[key] = null; continue; }
      const hidden = []; g.scene.traverse((o) => { if (o.isMesh && o !== bg && o !== msh && o.visible) { o.visible = false; hidden.push(o); } });
      msh.visible = true; msh.count = 1;
      msh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(C.x, C.y, C.z)); msh.instanceMatrix.needsUpdate = true;
      const an = msh.geometry.attributes.aAnim; an.array[0] = (window.__PH || 0); an.array[1] = (window.__AMP || 0); an.needsUpdate = true;
      if (msh.instanceColor) { msh.setColorAt(0, new THREE.Color(key === 'fish' ? '#c8d4e0' : '#ffffff')); msh.instanceColor.needsUpdate = true; }
      msh.geometry.computeBoundingBox(); const bb = msh.geometry.boundingBox, ctr = bb.getCenter(new THREE.Vector3()).add(C), sz = bb.getSize(new THREE.Vector3()), R = Math.max(sz.z * 0.5, sz.y * 0.75, sz.x * 0.5), D = R / Math.tan(THREE.MathUtils.degToRad(9)) * 1.12;
      const views = [[new THREE.Vector3(-D, 0, 0), new THREE.Vector3(0, 1, 0)], [new THREE.Vector3(0, D, 0), new THREE.Vector3(1, 0, 0)], [new THREE.Vector3(-0.55, 0.3, 0.78).normalize().multiplyScalar(D), new THREE.Vector3(0, 1, 0)], [new THREE.Vector3(0, 0.15, 1).normalize().multiplyScalar(D), new THREE.Vector3(0, 1, 0)]];
      out[key] = [];
      for (const [off, up] of views) {
        cam.position.copy(ctr).add(off); cam.up.copy(up); cam.lookAt(ctr); cam.updateMatrixWorld();
        g.renderer.setSize(W, H, false); g.renderer.setViewport(0, 0, W, H); g.renderer.setScissorTest(false);
        g.renderer.render(g.scene, cam); await new Promise((r) => setTimeout(r, 50)); g.renderer.render(g.scene, cam); out[key].push(g.renderer.domElement.toDataURL('image/png'));
      }
      cam.up.set(0, 1, 0);
      for (const o of hidden) o.visible = true;
    }
    return out;
  }, list.map((x) => x[0]), );
  for (const [key, ref] of list) {
    if (!shots[key]) { console.log('missing', key); continue; }
    shots[key].forEach((d, i) => fs.writeFileSync(`${OUT}/tv_${key}_${i}.png`, Buffer.from(d.split(',')[1], 'base64')));
  }
  console.log('done', errs.slice(0, 3)); await b.close();
})();
