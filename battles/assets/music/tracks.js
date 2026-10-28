// The music config: which song file plays in which role. Song files keep the name they
// were delivered with (normalized: lower case, words joined by '-'); adding a song or
// moving one to another role is a change here only, never a rename. src/audio.js reads
// this.
//
// Loops (TRACKS): role: { file, loop, synth?, own? }
//   loop   seconds into the song where its own ending starts: the next pass crossfades in there
//   synth  the synthesised song to fall back on while the file loads or if it's missing
//          (default: the role's own name)
//   own    only for its own faction / battleground, never picked at random
// Roles: title, setup, battle, battle_2; battle_<world> (picked per battle: battleTheme() in
// src/game.js); setup_<world> (the planning version of battle_<world>: setupTheme()).
export const TRACKS = {
  title: { file: 'title.mp3', loop: 115.0 },
  setup: { file: 'setup-1.mp3', loop: 116.0 },
  battle: { file: 'battle-1.mp3', loop: 145.6 },
  battle_2: { file: 'cavalry-battle-charge.mp3', loop: 149.6, synth: 'battle' }, // (a second main theme: shares the main theme's turn)

  battle_tribal: { file: 'tribal-stomp.mp3', loop: 117.4, synth: 'battle' },
  battle_medieval: { file: 'medieval-tournament-brawl.mp3', loop: 118.4, synth: 'battle' },
  battle_pirate: { file: 'sea-shanty-pirate-jig.mp3', loop: 117.8, synth: 'battle' },
  battle_wildwest: { file: 'dusty-wild-west-showdown.mp3', loop: 117.6, synth: 'battle' },
  battle_viking: { file: 'fierce-mischievous-vikings.mp3', loop: 116.6, synth: 'battle' },
  battle_dynasty: { file: 'wuxia-dynasty.mp3', loop: 108.8, synth: 'battle' },
  battle_jjk: { file: 'jjk-neon-night-arena.mp3', loop: 118.0, synth: 'battle', own: true }, // (electric: only for JJK armies)
  battle_avatar: { file: 'avatar-adventure.mp3', loop: 116.4, synth: 'battle' },

  setup_tribal: { file: 'anticipatory-tribal-groove.mp3', loop: 116.3, synth: 'setup' },
  setup_wildwest: { file: 'wild-west-dusty-standoff.mp3', loop: 116.2, synth: 'setup' },
  setup_medieval: { file: 'medieval-courtly-motif.mp3', loop: 118.3, synth: 'setup' },
  setup_viking: { file: 'viking-oars.mp3', loop: 112.4, synth: 'setup' },
  setup_jjk: { file: 'jjk-scheming-motif.mp3', loop: 114.0, synth: 'setup' },
  setup_avatar: { file: 'avatar-battle-plan.mp3', loop: 115.6, synth: 'setup' },
  setup_dynasty: { file: 'avatar-battle-plan.mp3', loop: 115.6, synth: 'setup' }, // (Avatar's until its own arrives)
};

// One-shot stingers: role: file
export const STINGERS = {
  victory: 'victory.mp3',
  defeat: 'defeat.mp3',
  start: 'battle-start.mp3',
};
