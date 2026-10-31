// Browser: tools/gameplay-regressions.html. Node: see run-gameplay-regressions.cjs.
// Uses the real input, physics, weapon, pickup and damage paths; rendering/audio
// are unnecessary for the assertions and are checked separately in the browser.
import { Game } from '../src/game.js';
import { Board } from '../src/board.js';
import { Spider } from '../src/spider.js';
import { Input } from '../src/input.js';
import { DropSpawner } from '../src/weapons.js';
import { settings } from '../src/settings.js';
import { tickMods } from '../src/modifiers.js';
import '../src/weapons/index.js';

const DT = 1 / 60;
const ctl = (fields = {}) => ({ aimX: 1, aimY: 0, angle: 0, aimMag: 1,
  fire: false, firePressed: false, fireReleased: false, ...fields });
const check = (ok, message) => { if (!ok) throw new Error(message); };
const span = (s) => Math.hypot(s.x2-s.x1, s.y2-s.y1);

function fixture(id = 'saber') {
  const game = Object.assign(Object.create(Game.prototype), {
    time: 0, stopT: 0, scene: null, players: [], spiders: [], enemies: [],
    pickups: [], projectiles: [], blades: [], nextBlades: [], corpses: [], mods: {},
    input: { rumble() {} }, fx: new Proxy({}, { get: () => () => {} }),
  });
  game.board = new Board({ id: 'test', name: 'Test', theme: 'night',
    solids: [{ poly: [[0,800],[1920,800],[1920,1000],[0,1000]] }],
    spawns: [[400,700]], dropPoints: [[400,-30]], killY: 1200 });
  game.world = game.board.world;
  const sp = new Spider(game, { color: { main: '#4dd2ff', dark: '#18394f' }, inputId: 'test' });
  sp.place(400,500); sp.ctl = ctl(); game.spiders.push(sp);
  if (id) sp.giveWeapon(game.createWeapon(id));
  return { game, sp, w: sp.weapon };
}
function source(sp, fields = {}) {
  const input = new Input(); input.mock = [{ id: 'test', ...fields }];
  input.poll(); sp.update(DT, input.get('test'));
}
function enemy() { return { kind: 'enemy', team: 'bug', alive: true, x: 1500, y: 100, r: 10, hurt() { return true; } }; }

export function runRegressions() {
  const results = [];
  const test = (name, fn) => { try { fn(); results.push({ name, pass: true }); }
    catch (e) { results.push({ name, pass: false, error: e.stack || String(e) }); } };
  const previousAuto = settings.autoPickup;
  settings.autoPickup = false;
  try {
    for (const id of ['saber','twinsaber','glaive']) {
      test(`${id}: hold full RT charge; lunge once on release`, () => {
        const { sp, w } = fixture(id);
        w.update(DT, ctl({ fire: true, firePressed: true }));
        for (let i=0;i<90;i++) w.update(DT, ctl({ fire: true }));
        check(sp.vx===0 && sp.vy===0, 'Lunged while RT was held');
        check(w.charging===1, 'Full charge was not retained');
        w.update(DT, ctl({ fireReleased: true }));
        check(sp.vx>1500 && w.lungeT>0 && !w.charging, 'Release did not lunge');
        const vx=sp.vx;
        for (let i=0;i<60;i++) w.update(DT, ctl());
        check(sp.vx===vx, 'Lunge repeated without a fresh press');
      });
      test(`${id}: missing input and unequip cancel the charge`, () => {
        const { sp, w } = fixture(id);
        w.update(DT, ctl({ fire: true, firePressed: true }));
        w.update(DT, ctl()); // neutral after stun/disconnect has no release edge
        w.update(DT, ctl({ fireReleased: true }));
        check(sp.vx===0 && sp.vy===0 && !w.charging, 'Lost input triggered a lunge');
        w.update(DT, ctl({ fire: true, firePressed: true }));
        const p=sp.dropWeapon();
        check(!w.charging, 'Drop retained a pending lunge');
        gameTake(sp,p);
        w.update(DT, ctl({ fireReleased: true }));
        check(sp.vx===0, 'Re-equipped blade launched an old charge');
      });
      test(`${id}: quick press/release still lunges`, () => {
        const { sp,w }=fixture(id);
        w.update(DT,ctl({firePressed:true,fireReleased:true}));
        check(sp.vx>400 && !w.charging,'Buffered tap did not lunge on release');
      });
      test(`${id}: successful hits shrink collision reach and exhaust the blade`, () => {
        const { game,sp,w }=fixture(id);w.on=1;
        const before=w.segsAt(0,0,0).map(span);
        check(!game.damage({ ...enemy(), hurt:()=>false },{from:sp,weapon:w,melee:true}), 'Rejected hit landed');
        check(w.bladeHits===8,'Rejected hit wore the blade');
        game.damage(enemy(),{from:sp,weapon:w,melee:true});
        check(w.segsAt(0,0,0).every((s,i)=>span(s)<before[i]),'Blade collision reach did not shrink');
        const p=sp.dropWeapon();game.takePickup(sp,p);
        check(w.bladeHits===7,'Pickup reset wear');
        for(let i=0;i<7;i++) game.damage(enemy(),{from:sp,weapon:w,melee:true});
        check(w.bladeHits===0 && !sp.weapon && !w.segsAt(0,0,0).length,'Used-up blade remained active');
        check(game.pickups.every(p=>p.removed || !p.canTake),'Spent blade could be picked up');
        check(!game.damage(enemy(),{from:sp,weapon:w,melee:true}),'Stale spent segment still damaged');
      });
    }
    test('Glaive can prepare a new charge while its previous lunge cooldown finishes', () => {
      const {sp,w}=fixture('glaive');w.cool=0.4;
      w.update(DT,ctl({fire:true,firePressed:true}));
      for(let i=0;i<40;i++)w.update(DT,ctl({fire:true}));
      check(sp.vx===0 && w.charging>0,'Cooldown blocked preparation or auto-launched it');
      w.update(DT,ctl({fireReleased:true}));check(sp.vx>1000,'Prepared glaive did not lunge on release');
    });
    test('Pistol still fires on RT press', () => {
      const {w}=fixture('pistol');const ammo=w.ammo;
      w.update(DT,ctl({fire:true,firePressed:true}));
      check(w.ammo<ammo,'Ranged weapon started waiting for release');
    });
    test('Input edges produce a release lunge for every melee weapon', () => {
      for(const id of ['saber','twinsaber','glaive']) {
        const {sp,w}=fixture(id),input=new Input();
        const step=(fields)=>{input.mock=[{id:'test',...fields}];input.poll();sp.update(DT,input.get('test'));input.consume();};
        step({rt:1});for(let i=0;i<50;i++)step({rt:1});
        check(Math.abs(sp.vx)<1,`${id} lunged before input release`);
        step({rt:0});check(sp.vx>1000,`${id} input release did not lunge`);
      }
    });
    test('RB takes a nearby gun instead of recalling a farther thrown sword', () => {
      const {game,sp,w}=fixture();sp.throwWeapon();const blade=w.pickup;
      blade.x=1000;blade.y=sp.y;
      const gun=game.spawnPickup(game.createWeapon('pistol'),sp.x+30,sp.y);
      sp.recall();check(sp.weapon===gun.weapon && w.mode==='thrown','Recall took priority over nearby gun');
    });
    test('RB pulls the nearest weapon regardless of aim, including the thrown sword', () => {
      const {game,sp,w}=fixture();sp.throwWeapon();w.pickup.x=sp.x+600;w.pickup.y=sp.y;
      const near=game.spawnPickup(game.createWeapon('pistol'),sp.x-200,sp.y);
      game.spawnPickup(game.createWeapon('shotgun'),sp.x+300,sp.y);
      sp.recall();check(near.yankedBy===sp && w.mode==='thrown','Aim or sword ownership beat actual distance');
      near.removed=true;w.pickup.x=sp.x+100;
      sp.recall();check(w.mode==='recall','Nearest thrown sword did not recall');
    });
    test('B discards without recall; immediate RB can grab a different weapon', () => {
      const {game,sp,w}=fixture();source(sp,{b:true});
      check(!sp.weapon && !sp.recallable && !w.mode,'B used the recallable spinning throw');
      const replacement=game.spawnPickup(game.createWeapon('shotgun'),sp.x+20,sp.y);
      source(sp,{rb:true});check(sp.weapon===replacement.weapon,'Discard cooldown blocked manual replacement');
    });
    test('X swaps a worn blade with the ground weapon', () => {
      const {game,sp,w}=fixture();w.wearBlade();
      const p=game.spawnPickup(game.createWeapon('pistol'),sp.x+20,sp.y);
      source(sp,{x:true});check(sp.weapon===p.weapon && game.pickups.some(p=>p.weapon===w&&!p.removed),'Swap did not exchange weapons');
    });
    test('A grounded javelin can be pulled out and collected', () => {
      const {game,sp}=fixture(null);const w=game.createWeapon('glaive');
      const p=game.spawnPickup(w,sp.x+20,sp.y);w.mode='stuck';w.pickup=p;p.stuck=true;p.mode='stuck';
      sp.recall();check(sp.weapon===w && !w.mode,'Stuck glaive could not be collected');
    });
    test('Held and thrown blade clashes consume one hit on both weapons', () => {
      const {game,sp,w}=fixture(),other=game.createWeapon('twinsaber');
      const foe=new Spider(game,{slot:1,color:sp.color});foe.place(800,500);foe.giveWeapon(other);
      w.on=other.on=1;w.clash({weapon:other,owner:foe,x2:800,y2:500},w.segsAt(w.x,w.y,0)[0]);
      check(w.bladeHits===7 && other.bladeHits===7,'Clash wear was absent or duplicated');
    });
    test('A flying blade exhausted by a clash cannot become a reusable loose pickup', () => {
      const {game,sp,w}=fixture();w.bladeHits=1;sp.throwWeapon();const p=w.pickup;
      const other=game.createWeapon('saber');
      w.clash({weapon:other,owner:null,x2:p.x,y2:p.y},w.segsAt(p.x,p.y,0)[0]);
      check(w.bladeHits===0 && p.spent && !p.canTake && !sp.recallable,'Clash-out-of-flight revived a spent sword');
    });
    test('Thrown sword exhaustion clears recall, active segments and pickup eligibility', () => {
      const {game,sp,w}=fixture();sp.throwWeapon();const p=w.pickup;
      game.nextBlades=[{weapon:w}];game.blades=[{weapon:w}];
      for(let i=0;i<8;i++) game.damage(enemy(),{from:sp,weapon:w,melee:true});
      check(!sp.recallable && !w.mode && !p.canTake && !game.nextBlades.length && !game.blades.length,'Spent thrown blade remained live');
    });
    test('Fat Plasma hits wear the blade; Bottomless does not restore its durability', () => {
      const {game,sp,w}=fixture();const foe=enemy();foe.x=500;foe.y=510;game.enemies=[foe];
      game.mods={list:['thick','ammo'],bladeExtra:14,infiniteAmmo:true};
      game.nextBlades=[{weapon:w,owner:sp,x1:480,y1:500,x2:520,y2:500}];
      tickMods(game,DT);check(w.bladeHits===7,'Thick-blade damage bypassed wear');
      game.enemies=[];tickMods(game,DT);check(w.bladeHits===7,'Infinite ammo restored wear');
    });
    test('Spawn stock stays occupied after normal landing, including lobby-style offset zero', () => {
      for(const offset of [40,0]) {
        const {game}=fixture(null),drops=new DropSpawner(game,game.board);
        const [p]=drops.seedSpawns([[400,700]],offset);p.x=400;p.y=787;p.age=10;p.grounded=true;
        for(let i=0;i<30;i++)drops.seedSpawns([[400,700]],offset);
        check(game.pickups.length===1 && drops.hasSpawn(400,700),'Unclaimed resting stock duplicated');
        p.x+=250;drops.seedSpawns([[400,700]],offset);check(game.pickups.length===2,'Far-displaced stock blocked replacement');
      }
    });
    test('Fixed drop column cannot accumulate unclaimed weapons in flight or after landing', () => {
      const {game}=fixture(null),drops=new DropSpawner(game,game.board);
      const p=drops.dropOne();check(p && !drops.dropOne(),'Incoming drop was immediately duplicated');
      p.y=787;p.age=10;p.grounded=true;
      for(let i=0;i<30;i++)check(!drops.dropOne(),'Landed drop was duplicated');
      p.spent=true;check(drops.dropOne(),'Spent stock blocked resupply');
    });
    test('Taking stock permits refill, including after a used weapon is returned', () => {
      const {game,sp}=fixture(null),drops=new DropSpawner(game,game.board);
      const [p]=drops.seedSpawns([[400,700]]);game.takePickup(sp,p);
      const returned=sp.dropWeapon();returned.x=400;returned.y=787;
      drops.seedSpawns([[400,700]]);check(game.pickups.length===3,'Taken-and-returned weapon blocked new stock');
      const fresh=game.pickups[2];fresh.removed=true;drops.seedSpawns([[400,700]]);
      check(game.pickups.length===4,'Removed stock did not replenish');
    });
  } finally { settings.autoPickup=previousAuto; }
  return results;
}
function gameTake(sp,p) { sp.game.takePickup(sp,p); }
