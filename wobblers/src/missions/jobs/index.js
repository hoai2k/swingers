// Every job, one file per island. A job is plain data:
//
//   {
//     id, name, icon (emoji), island ('home' | 'city' | 'snow' | 'desert' | 'jungle' | 'tropical'),
//     blurb,                      one line for the banner and the jobs list
//     giver: { at: [x, z], yaw, npc: role | { role, ...npc.js opts }, lines, go, thanks, board?, dy? }
//                                 board: true builds a JOBS board instead of an NPC
//     pay,                        coins for a bronze; silver x1.25, gold x1.5; co-op +25% per extra player, split
//     time,                       limit in seconds (fail after), gold / silver: medal times in seconds
//     vehicle?: { type, color?, opts?, at?: [x, z, yaw] }   spawned beside the player at the start
//     vehicleName?,               "the scooter" (HUD hint when a step wants a vehicle)
//     cargo?,                     'pizza' | 'parcel' | 'cocoa' | 'burger' | 'fossil' carried from the start
//     steps: [ step, ... ] or (M, run) => [...]       see ../steps.js for the step types
//   }
//
// Helpers: race(points, opts) turns [[x, z], ...] into hoop checkpoints.
import { HOME_JOBS } from './home.js';
import { CITY_JOBS } from './city.js';
import { SNOW_JOBS } from './snow.js';
import { DESERT_JOBS } from './desert.js';
import { JUNGLE_JOBS } from './jungle.js';
import { COVE_JOBS } from './cove.js';

export const ISLANDS = [
  { id: 'home', name: 'Wobbly Island' },
  { id: 'city', name: 'Bigtown' },
  { id: 'snow', name: 'Frostpeak' },
  { id: 'desert', name: 'Dusty Dunes' },
  { id: 'jungle', name: 'Tiki Jungle' },
  { id: 'tropical', name: 'Coconut Cove' },
];

export const JOBS = [...HOME_JOBS, ...CITY_JOBS, ...SNOW_JOBS, ...DESERT_JOBS, ...JUNGLE_JOBS, ...COVE_JOBS];
