const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto('http://localhost:8123/spiders/');
  await pg.waitForTimeout(2000);
  const r = await pg.evaluate(async () => {
    const g = window.__sp;
    g.manual = true;
    g.go('lobby');
    const run = (n, mocks) => { g.input.mock = mocks; for (let i = 0; i < n; i++) { g.input.poll(); g.step(1/60); } };
    run(2, [{ id: 'padA', a: true }, { id: 'padB', a: true }]);
    run(60, [{ id: 'padA' }, { id: 'padB' }]);
    const A = g.players[0].spider, B = g.players[1].spider;
    const out = {};
    // web up-right toward the swing rock
    A.place(800, 820);
    run(30, [{ id: 'padA' }, { id: 'padB' }]);
    run(1, [{ id: 'padA', r: { x: 0.284, y: -0.959, mag: 1 } }, { id: 'padB' }]);
    run(1, [{ id: 'padA', r: { x: 0.284, y: -0.959, mag: 1 }, lt: 1 }, { id: 'padB' }]);
    const traj = [];
    for (let i = 0; i < 60; i++) { run(1, [{ id: 'padA', lt: 1, l: { x: 1, y: 0, mag: 1 } }, { id: 'padB' }]); if (i % 10 == 0) traj.push([Math.round(A.x), Math.round(A.y), A.web && A.web.state]); }
    out.webTraj = traj;
    run(60, [{ id: 'padA' }, { id: 'padB' }]);
    // saber kill
    A.place(900, 800); B.place(980, 800); B.invuln = 0; A.invuln = 0;
    const sab = g.createWeapon('saber'); A.giveWeapon(sab);
    run(20, [{ id: 'padA', r: { x: -1, y: 0, mag: 1 } }, { id: 'padB' }]);
    run(20, [{ id: 'padA', r: { x: 1, y: 0, mag: 1 } }, { id: 'padB' }]);
    out.Balive = B.alive;
    // throw & recall
    run(1, [{ id: 'padA', r: { x: 1, y: -0.2, mag: 1 }, rt: 1 }, { id: 'padB' }]);
    run(30, [{ id: 'padA', r: { x: 1, y: -0.2, mag: 1 } }, { id: 'padB' }]);
    out.afterThrow = [!!A.weapon, sab.mode];
    run(1, [{ id: 'padA', rt: 1 }, { id: 'padB' }]);
    run(60, [{ id: 'padA' }, { id: 'padB' }]);
    out.afterRecall = [!!A.weapon && A.weapon.id, sab.mode];
    // versus
    g.go('versus');
    run(200, [{ id: 'padA', rt: 1 }, { id: 'padB', l: { x: -1, y: 0, mag: 1 } }]);
    out.vs = [g.scene.state, g.board.name, g.spiders.map(s => s.alive), g.pickups.map(p=>[p.weapon.id,Math.round(p.x),Math.round(p.y)]), g.spiders.map(s=>s.weapon&&s.weapon.id)];
    g.render();
    return out;
  });
  console.log(JSON.stringify(r));
  await pg.screenshot({ path: 'vs.png' });
  console.log(errs.join('\n'));
  await b.close();
})();
