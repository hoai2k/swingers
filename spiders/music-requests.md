# Spider Swingers — music requests

**Status: 10 tracks requested; 2 delivered: #6 `win.mp3` and #7 `lose.mp3` (ElevenLabs Music stingers, listed in the manifest). Full songs are made separately by the owner.** Until a track is
delivered the game keeps playing the shared Rounders soundtrack, so
nothing is blocked.

Ordered from most to least important: the first few are heard by
everyone, every session; the rest add variety.

## How to deliver

- Put each file in `spiders/assets/music/` with exactly the filename below.
- Add the filename to a `"music": [...]` list in
  `spiders/assets/web/manifest.json` (next to `"images"`). Unlisted files
  are never requested.
- The game picks tracks by filename prefix, so extra takes slot in by
  name: `versus_4.mp3`, `survival_3.mp3`, `trials_2.mp3`, ... join their
  rotation automatically.

## What every track needs

- MP3, stereo, 44.1 kHz, 192 kbps or better; mastered to about −14 LUFS
  so tracks sit at the same level as each other and the sound effects.
- Instrumental. Wordless chants or shouts are fine; no lyrics.
- Loops (marked **loop**) must loop seamlessly: no fade-in, no fade-out,
  no reverb tail cut off at the end, and the last bar leads straight back
  into the first.
- Leave room for the sound effects: the game is full of saber hums,
  laser zaps and explosions, so keep the mix out of the way of sharp
  high-end hits, and keep the low end tight rather than boomy.
- The sound of the game: cartoon spiders with glowing plasma swords,
  swinging on webs in painted fantasy arenas. Playful, punchy and a bit
  mischievous, never grim.

## The tracks

### 1. `theme.mp3` — title screen and lobby (loop, ~2:00)

Plays on the start screen and the whole time players are joining, picking
spiders and swinging between the lobby islands. It's the first thing
anyone hears and it loops for a long time, so it must stay fun on repeat.

> A playful, mischievous instrumental main theme for a cartoon party game about spiders that swing on webs and fight with glowing plasma swords. Mid-tempo, about 112 BPM, in a minor key with a bouncy, sneaky groove. Pizzicato strings and plucked muted guitar play a creeping, tiptoeing eight-note riff that suggests eight little legs scuttling; a warm upright bass walks underneath; light brushed drums with a snappy rim click. The melody is carried by a bright whistling synth lead answered by a glockenspiel, catchy and hummable, with a cheeky chromatic turn at the end of each phrase. A shimmering, sweeping synth whoosh rises before each new section like a web being thrown. Structure: intro riff, A melody, B section with a bigger heroic lift and swelling strings, a short breakdown with just the scuttling pizzicato and bass, then back to A. Cozy and inviting rather than aggressive. Seamless loop, about two minutes, instrumental, no vocals.

### 2. `versus_1.mp3` — main battle track (loop, ~2:30)

The core VS soundtrack: up to eight players dueling with sabers and guns,
rounds of 30–90 seconds back to back. High energy, but the explosions and
saber clashes have to cut through it.

> A high-energy instrumental battle track for a chaotic local-multiplayer arena brawler where cartoon spiders duel with glowing plasma swords and laser guns. Fast, about 150 BPM, driving and playful. Punchy electro-funk drums with a big clap on two and four, a slap bass line that swings between octaves, choppy funk guitar stabs, and a bright, buzzy synth lead with a hooky, call-and-response melody. Add saber-like sweeping synth risers and laser-pew arpeggios as ear candy between phrases, and short brass hits for punctuation. Keep the high end clean so sword clashes and explosions in the game cut through. Structure: four-bar drum fill intro, main hook, a breakdown with the bass and a ticking hi-hat that builds tension, then a bigger drop with the full band and a counter-melody, then back to the hook. Confident, competitive and fun, never dark. Seamless loop, about two and a half minutes, instrumental, no vocals.

### 3. `survival_1.mp3` — co-op wave survival (loop, ~3:00)

Plays while the team holds off waves of insects. Tension that builds,
with a "we can do this" feel rather than horror.

> A tense, building instrumental track for a co-op wave-survival game where a team of cartoon spiders fights off swarms of buzzing insects with glowing swords and blasters. About 132 BPM in a minor key. Start with a pulsing low synth ostinato and a ticking clock-like hi-hat, layered with buzzing, swarming string tremolos that rise and fall like wings. Taiko-style toms and big, dry drums enter as the energy builds, with a heroic horn melody that answers the swarm theme, hopeful and defiant. Midway, a stripped-back section with just the pulse and tremolo strings gives a breather, then the full arrangement returns bigger, with a counter-melody on a bright synth. Determined and teamwork-driven, adventurous rather than scary. Seamless loop, about three minutes, instrumental, no vocals.

### 4. `boss.mp3` — survival boss waves (loop, ~2:00)

Takes over during the Brood Tyrant boss waves (every second stage), then
the survival music comes back.

> An epic, over-the-top instrumental boss battle theme for a cartoon game in which a team of tiny spiders battles a gigantic armored queen insect. About 140 BPM in a dramatic minor key. A massive, heavy riff on distorted guitar doubled by low brass and an organ, thunderous drums with double-kick bursts, a choir singing a wordless, ominous "ah" chant, and frantic string runs that swarm like wings. The tone is theatrical and a little tongue-in-cheek, like a cartoon villain's grand entrance, not genuinely frightening. Include a short breakdown with a buzzing synth and pounding toms that builds back into the main riff with a triumphant brass counter-melody, as if the heroes are fighting back. Seamless loop, about two minutes, instrumental, no lyrics.

### 5. `versus_2.mp3` — second battle track (loop, ~2:30)

So long VS sessions don't repeat one song. A different flavor from
`versus_1`.

> An energetic instrumental battle track for a cartoon arena brawler with spiders fighting with glowing plasma sabers, in a surf-rock and spaghetti-western fusion style. About 160 BPM. Twangy, reverb-drenched lead guitar plays a fast, galloping melody with tremolo-picked runs, backed by a driving surf drum beat, a walking bass, organ stabs, and a big whistled counter-melody. Add a trumpet duel section where two horns trade dramatic phrases like a standoff, with a whip-crack snare hit on the downbeat. Playful, cocky and cinematic, like a cartoon showdown at high noon. Structure: short guitar intro, main theme, standoff section, return of the theme with full band. Seamless loop, about two and a half minutes, instrumental, no vocals.

### 6. `win.mp3` — match win stinger (one-shot, ~5 s) — ✅ delivered

Plays once over the music when someone wins a VS match.

> A short, triumphant instrumental victory fanfare, about five seconds long, for a cartoon party game about spiders with plasma swords. Bright brass and a whistling synth play a cheeky, celebratory rising motif, backed by a snare roll and a cymbal crash, finishing on a big major chord with a playful glockenspiel sparkle and a quick upward synth whoosh. Joyful, cartoonish and punchy. Clean ending with a natural ring-out, no loop, no vocals.

### 7. `lose.mp3` — survival game over stinger (one-shot, ~6 s) — ✅ delivered

Plays once when the whole team is out in survival.

> A short instrumental "game over" sting, about six seconds long, for a cartoon co-op game where a team of little spiders has been overrun by a swarm of insects. A comic, deflating descending phrase on a muted trombone and a tuba, with a falling pizzicato string run and a buzzing synth swarm that swells and then fades away, ending on a soft, slightly sad minor chord with a single glockenspiel note. Funny and sympathetic rather than gloomy, like a cartoon "oh no". Clean ending with a natural ring-out, no loop, no vocals.

### 8. `trials_1.mp3` — Trials challenge mode (loop, ~2:30)

Plays during the 18 tiered challenges (one life, special rules). Focused
and precise, a little different from regular survival.

> A focused, rhythmic instrumental track for a skill-challenge mode in a cartoon game where spiders face tricky trials with special rules. About 124 BPM. A precise, clockwork-like groove: tight electronic drums, a ticking woodblock, a staccato marimba ostinato, plucked harp arpeggios, and a cool, confident synth bass. A sleek lead melody on a muted trumpet weaves over the top, calm but determined, like a master of the craft concentrating. Midway the arrangement thins to the marimba and ticking, then rebuilds with string stabs for extra urgency. Clever, stylish and motivating rather than aggressive. Seamless loop, about two and a half minutes, instrumental, no vocals.

### 9. `versus_3.mp3` — third battle track (loop, ~2:30)

More VS variety, leaning electronic.

> A bouncy, high-energy instrumental electro track for a cartoon arena brawler with spiders swinging on webs and dueling with glowing plasma swords. About 128 BPM, four-on-the-floor. A thick, wobbling synth bass, crisp claps, rolling hi-hats, chiptune-style arpeggios, and a bright, catchy saw-wave lead melody with a playful, swinging rhythm. Add laser-zap sound-design accents, a rising white-noise sweep before each drop, and a half-time breakdown with a dreamy pad before the energy returns. Fun, colorful and arcade-like, never harsh. Seamless loop, about two and a half minutes, instrumental, no vocals.

### 10. `survival_2.mp3` — second survival track (loop, ~3:00)

Variety for long survival runs.

> An adventurous, driving instrumental track for a co-op wave-survival game where a team of cartoon spiders defends floating islands from swarms of insects. About 138 BPM in a minor key that lifts to major in the chorus. Celtic-inflected: a fast fiddle and tin whistle play an urgent jig-like melody over pounding frame drums, a strummed bouzouki and a driving bass. Buzzing, insect-like string effects swell in the background like an approaching swarm, answered by a rousing, heroic group of horns in the chorus. A short quiet section with only a single fiddle and a heartbeat drum gives a breather before the full band crashes back in. Brave and spirited. Seamless loop, about three minutes, instrumental, no vocals.
