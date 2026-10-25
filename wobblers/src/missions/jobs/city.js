// Bigtown jobs: cab fares, the parcel round, the building site and a stadium shoot-out.
// Street plan: city/layout.js (avenues x = 700..1050, streets z = -150..236, street level y = 2).

export const CITY_JOBS = [
  {
    id: 'cab', name: 'Bigtown Cab', icon: '🚕', island: 'city',
    blurb: 'Two fares across town: pick them up, drop them off, mind the paintwork',
    giver: { at: [781, 112], yaw: -Math.PI / 2, npc: { role: 'taxi' }, lines: ['Need a shift? Take the cab!'], go: 'Meter\'s running!', thanks: 'Top driver!' },
    pay: 70, time: 260, gold: 130, silver: 185,
    vehicle: { type: 'taxi', color: 0xffd23f }, vehicleName: 'the taxi',
    steps: [
      { type: 'passenger', key: 'fare1', npc: { role: 'businessman' }, from: [778, 51], to: [846, -140], vehicle: true, r: 10,
        text: 'Pick up the fare on Brick Row', rideText: 'Drop them at the stadium', board: 'The stadium, and step on it!', thanks: 'Just in time for kick-off!', done: 'Fare paid!' },
      { type: 'passenger', key: 'fare2', npc: { role: 'surfer' }, from: [910, -144], to: [1050, 118], vehicle: true, r: 10,
        text: 'Next fare: outside the building site', rideText: 'Take them to the beach', board: 'Beach, dude!', thanks: 'Gnarly ride, thanks!', done: 'Fare paid!' },
    ],
  },
  {
    id: 'courier', name: 'Parcel Round', icon: '📦', island: 'city',
    blurb: 'Load the van at the depot and stop at four drop-offs',
    giver: { at: [992, 128], yaw: Math.PI, board: true },
    pay: 60, time: 240, gold: 120, silver: 170,
    vehicle: { type: 'delivery', color: 0xffffff }, vehicleName: 'the delivery van',
    cargo: 'parcel',
    steps: [
      { type: 'reach', at: [910, 60], r: 7, stop: true, vehicle: true, vehicleName: 'the van', text: 'Drop-off 1: the cinema corner', hint: 'Stop in the beacon to drop the parcel', done: 'Parcel 1!' },
      { type: 'reach', at: [770, -75], r: 7, stop: true, vehicle: true, vehicleName: 'the van', text: 'Drop-off 2: downtown', hint: 'Stop in the beacon to drop the parcel', done: 'Parcel 2!' },
      { type: 'reach', at: [700, 180], r: 7, stop: true, vehicle: true, vehicleName: 'the van', text: 'Drop-off 3: Seaside Terraces', hint: 'Stop in the beacon to drop the parcel', done: 'Parcel 3!' },
      { type: 'reach', at: [980, 180], r: 7, stop: true, vehicle: true, vehicleName: 'the van', text: 'Last drop-off: Market Street', hint: 'Stop in the beacon to drop the parcel', take: true, done: 'All delivered!' },
    ],
  },
  {
    id: 'site', name: 'Building Site', icon: '🏗️', island: 'city',
    blurb: 'Carry the girders and crates to the crane\'s hook pad',
    giver: { at: [944, -152.5], yaw: Math.PI, npc: { role: 'townsfolk', hat: 'hardhat', colors: { shirt: 0xff8a1a, pants: 0x3b5c9a, hat: 0xffd23f }, outfit: ['vest'] }, lines: ['Hard hats on!'], go: 'Hook pad\'s by the crane!', thanks: 'Ahead of schedule!' },
    pay: 50, time: 200, gold: 90, silver: 140,
    steps: [
      { type: 'items', kind: 'girder', spots: [[927, -160.5], [927, -163.5]], zones: [{ x: 958, z: -196, r: 3.2 }], text: 'Carry the girders to the hook pad', done: 'Hoisted!' },
      { type: 'items', kind: 'crate', spots: [[930, -160], [930.5, -162.2], [929, -165]], zones: [{ x: 958, z: -196, r: 3.2 }], text: 'Now the crates', done: 'Job done!' },
    ],
  },
  {
    id: 'goals', name: 'Stadium Shoot-out', icon: '⚽', island: 'city',
    blurb: 'Score three goals before the whistle',
    giver: { at: [833, -186], yaw: Math.PI, npc: { role: 'townsfolk', colors: { shirt: 0x2a62c9, pants: 0xffffff, hat: 0x222228 }, hat: 'cap', prop: 'flag' }, lines: ['Fancy a kick-about?'], go: 'Either goal counts!', thanks: 'What a striker!' },
    pay: 40, time: 150, gold: 50, silver: 90,
    steps: [
      { type: 'items', kind: 'football', need: 3, respawn: true, spots: [[836, -195]], leash: 140,
        zones: [{ box: [805.6, 807.9, -204.8, -197.2], y: 2.18, y1: 5.1 }, { box: [872.1, 874.4, -204.8, -197.2], y: 2.18, y1: 5.1 }],
        text: 'Score goals', hint: 'Kick it (run into it) or punch it while holding it', done: 'GOAL!' },
    ],
  },
];
