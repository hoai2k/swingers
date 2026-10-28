# Wobbly Battles — music requests

**Status: 12 open requests (the remaining setup / planning themes first), listed most important first; 21 delivered (below, kept for
the record): the battle, second battle (cavalry charge), setup and title themes, the Tribal,
Medieval, Pirate, Wild West, Viking, Dynasty, JJK and Avatar themes, the Tribal, Medieval,
Wild West, Viking, JJK and Avatar planning themes (owner-made songs), and the victory,
defeat and battle-start stingers (ElevenLabs Music). All twenty-one are in the game.**

The world themes are what most battles play (`battleTheme` in `src/game.js` picks the
theme of the factions on the field, or a campaign world's), so the missing ones come
first. Delivered songs don't need to loop seamlessly: the game crossfades from just
before the song's ending back to the start (its `loop` in `assets/music/tracks.js`); the
synthesised music stays as the fallback for any track that hasn't arrived. Wiring the
files in is done when they are delivered.

## How to deliver

- Put each file in `battles/assets/music/` under its own name (the title it was
  generated or saved with), normalized: lower case, words joined by `-`
  (`Tribal Stomp.mp3` → `tribal-stomp.mp3`). Files are never renamed to their role: the
  role is mapped to the file in `battles/assets/music/tracks.js` (the role is given
  with each prompt), so a song can move to another role, or be swapped, without a
  rename. Use MP3 at 192 kbps or better, 44.1 kHz stereo.
- **Loops** must loop seamlessly. They need no fade-in, no fade-out and no reverb tail
  cut off at the end, and the last bar must lead straight back into the first. If the
  generator adds an intro or an ending, trim it, or deliver it separately (with
  `-intro` on the end of its name).
- **Stingers** are one-shots with a natural ending. They may have a reverb tail.
- Everything is instrumental: no vocals, lyrics, choirs singing words or spoken
  words. Wordless "hey!" shouts are fine where a prompt asks for them.
- Avoid imitating any existing game's soundtrack, film score or named artist.
- Record each track's prompt, generator and length in `assets/generation.json`, as
  for the images.

Shared feel: comedic but genuinely epic orchestral music for a wobbly physics battle
game. It is played straight, like a serious war film, so the floppy ragdoll soldiers
are funny against it. Think of a big, slightly over-the-top fantasy orchestra with a
cheeky wink.

---

## Open requests

## Setup / planning themes for each battle theme

*One planning song to go with each delivered battle theme (Tribal, Medieval, Wild West, Viking, JJK and Avatar are delivered; Pirate and Dynasty to go; until Dynasty's arrives it plays the Avatar one). Setup (and the result
screen) plays the planning version of the battle song that is coming: the battleground's
theme (Castle Courtyard → Medieval, Pirate Cove → Pirate, Volcano Jungle → Tribal, Canyon
Ruins → Wild West, Shibuya Crossing → JJK, Ba Sing Se Walls → Avatar), else a campaign
world's, else the theme of the factions holding most of the gold already placed (Viking,
Dynasty...); with none of those it stays on `setup-1.mp3`. Each one should feel like the
quiet, scheming "before" of its battle song: the same key and the same signature
instruments, so the switch to the battle feels like the same piece of music erupting,
but slower, softer and sneakier, like `setup-1.mp3` (tip-toeing, plotting, never loud
enough to distract while placing units). Already wired in (`setupTheme` in
`src/game.js`): when a file is delivered, map it in `assets/music/tracks.js` as
`setup_<world>: { file: '<its name>.mp3', loop, synth: 'setup' }`.*

## 1. Pirate planning theme (loop) — role `setup_pirate`

> Instrumental sneaky, playful pirate planning music for a comedic war game where a
> captain plots a raid in the ship's cabin by lantern light, 6/8 time at about 100 BPM,
> D minor, about 2 minutes, seamless loop with no intro and no ending. A quiet
> concertina and fiddle trading a mischievous scheming shanty-like melody, a soft
> bouncing tuba and pizzicato bass, creaky-timber percussion and a gentle ticking like a
> ship's clock, and a lonely bassoon adding sly comments. In the middle a quiet tension
> builds with tremolo strings and a low drum like distant cannon before relaxing again.
> Cheeky, swaying and anticipatory, the calm before the boarding. No vocals, no shouts,
> no electronic sounds.

## 2. Dynasty planning theme (loop) — role `setup_dynasty`

> Instrumental sneaky, playful kung-fu and samurai planning music for a comedic war game
> where generals study the battlefield from a hilltop tent, 100 BPM, about 2 minutes,
> seamless loop with no intro and no ending. A soft guzheng and koto picking a light
> walking line, a breathy shakuhachi and a quiet dizi flute trading a mischievous
> scheming melody (major pentatonic and in scale in turn), a gently tapped wooden
> clapper and soft taiko taps, and the occasional low opera-gong shimmer. Pizzicato
> strings tip-toe underneath; in the middle a quiet tension builds with an erhu tremolo
> and a single held taiko roll before relaxing again. Patient, cunning and
> anticipatory, like a master waiting to strike. Respectful of both traditions. No
> vocals, no shouts, no electronic sounds.

## 3. Ancient world battle theme (loop) — role `battle_ancient`

*New: the old Ancient & Viking request (one song for both) is split in two, since the worlds want very different music. Plays for Ancient armies (and the Ancient & Viking world, with the Viking song).*

> Instrumental sword-and-sandal epic battle music for the ancient Greek and Roman world
> of a comedic war game (hoplites, legionaries, gladiators, a minotaur and Zeus), 120
> BPM, D Mixolydian, about 2 minutes, seamless loop with no intro and no ending. Styled
> like a grand 1960s Hollywood toga-epic film score. Roman buccina-like straight
> trumpets blaring fanfares in parallel fifths, a pompous legion march on snare, field
> drum and big bass drum, a reedy aulos-like double-reed oboe playing an ancient-
> sounding melody over a plucked lyre and harp, and heavy low brass and timpani for
> the clash. A strutting triumph-parade section where tubas and trombones parade the
> theme far too proudly, with cymbals on every step, then a thunderbolt of timpani and
> brass, Zeus-sized, launching the big heroic return. Grand, marble-columned and
> slightly ridiculous in its self-importance. No vocals, no choir, no electronic sounds.

## 4. Galactic battle theme (loop) — role `battle_galactic`

*New: for the Galactic faction and its battleground, Starbase Hangar.*

> Instrumental grand space-opera battle music for a comedic war game's galactic faction
> (troopers, droids, saber-wielding knights, a dark lord and a giant walker), 132 BPM,
> C minor, about 2 minutes 30 seconds, seamless loop with no intro and no ending.
> Classic symphonic sci-fi film style: blazing trumpet and horn fanfares, a
> thunderous low-brass march motif for the villains, racing string runs and col legno
> taps, snare and timpani, and a soaring heroic theme on the horns (an original tune, not a copy of any film theme). A sneaky middle
> section for the droids and troopers: muted brass, bassoons and pizzicato
> bumbling in step like a clumsy march. Then the full orchestra and cymbals blast
> back for a huge dogfight climax. Epic, heroic and a touch cheesy. No vocals, no
> choir, no electronic sounds.

## 5. Minecraft battle theme (loop) — role `battle_blocky`

*New: for the Minecraft faction and its battleground, Blocky Plains.*

> Instrumental bouncy blocky-world battle music for a comedic war game's voxel faction
> (villagers, zombies, creepers, endermen, an iron golem), 124 BPM, A minor, about 2
> minutes, seamless loop with no intro and no ending. A cosy-meets-chaos mix: a
> gentle, slightly melancholy felt-piano motif and a warm pad from the peaceful
> blocky world, which the battle bursts into with chunky square-wave chiptune leads,
> 8-bit arpeggios and noise-channel drums layered over a real drum kit, pizzicato
> strings and a big brass section. A quiet sneaky bit with a ticking clock-like
> blip and a low hiss before a sudden boom. Charming, pixelated and silly, but with
> a real beat. No vocals, no sung words.

## 6. Final moments / slow-motion replay theme (loop) — role `final`

*Rewritten: the old prompt came out too serious. This one keeps the war-film slow motion but lets the joke show.*

> Instrumental over-the-top mock-tragic slow-motion music for replaying the last
> moments of a silly ragdoll battle, 56 BPM, C minor, about 1 minute 30 seconds,
> seamless loop. It starts out like the most heartbreaking war-film slow motion, then
> lets the joke show: swelling strings that sag and bend down in pitch like a tape
> slowing down, a solo French horn that cracks on its big high note, timpani hits that
> land a beat too late, a long trombone slide down after every grand phrase, a harp
> glissando that goes on far too long, and a dramatic pause that ends with a tiny
> triangle "ting" instead of the expected crash. Played with a perfectly straight face
> but clearly a parody: sniffly, overblown and funny, never actually sad. No vocals,
> no choir, no electronic sounds.

## 7. Replay / spectator theme (loop) — role `replay`

*Rewritten: the old prompt came out too light. This one is a punchy highlight reel.*

> Instrumental confident, cinematic highlight-reel music for watching battle replays in
> a war game, 104 BPM, D minor turning to D major, about 2 minutes, seamless loop. Like
> the orchestral score of a sports highlights show or a war documentary: a tight,
> driving low-string ostinato, punchy staccato brass hits, a big bass drum and snare
> groove, timpani accents, and a bold horn and trumpet theme that sounds like
> something important happened. Builds in waves with a few dramatic stops (as if the
> commentator rewinds a great moment), then rises to a proud, anthemic peak before
> looping. Serious, pumped and grand, but steady enough to play under the action
> without distracting. No vocals, no choir, no electronic sounds.

## 8. Good & Evil world battle theme (loop) — role `battle_goodevil`

> Instrumental colossal good-versus-evil orchestral battle music for the final world of
> a comedic war game, 136 BPM, alternating between D minor and D major, about 2 minutes
> 30 seconds, seamless loop. A dark, menacing section with low brass, pounding drums,
> a sinister organ and rumbling double basses, answered by a radiant, heavenly section
> with bright trumpets, a harp, shimmering high strings and bells. The two sides
> battle back and forth, then combine into a huge, over-the-top finale. Divine, demonic
> and absurdly epic. No vocals, no choir singing words, no electronic sounds.

## 9. Renaissance & Spooky world theme (loop) — role `battle_spooky`

> Instrumental spooky, mischievous orchestral battle music for a comedic war game
> world of skeletons, reapers and renaissance inventors, 132 BPM, C minor, about 2
> minutes, seamless loop. A dramatic pipe organ and harpsichord playing a fast, sinister
> but silly melody, xylophone "rattling bones" runs, pizzicato strings, a bassoon and
> tuba bumbling along, and the full orchestra with brass stabs and timpani for a big,
> gothic climax. Halloween-party spooky rather than frightening. No vocals, no
> wordless choir, no electronic sounds.

## 10. Campaign map / level select (loop) — role `campaign`

> Instrumental adventurous orchestral map music for choosing the next level of a
> comedic war campaign, 108 BPM, A major, about 2 minutes, seamless loop. A
> journeying feel: steady marching snare and pizzicato bass, a wandering, hopeful
> flute and oboe melody, horns rising on the big phrase, and a harp and glockenspiel
> sparkle. A short middle section on solo accordion and strings, like looking at an
> old map in a tavern, then the full orchestra returns. Curious, optimistic and
> ready for adventure. No vocals, no electronic sounds.

## 11. Secret Stash bonus theme (loop) — role `battle_secret`

> Instrumental quirky, mysterious bonus-level music for the secret world of a comedic
> war game, 118 BPM, F minor with surprising key changes, about 2 minutes, seamless
> loop. A playful mix of an orchestra and odd instruments: a theremin-like glissando
> violin, a toy piano, a muted trumpet, pizzicato strings, a bouncing tuba and a
> swinging snare brush beat. Brief bursts of a grand, heroic orchestra that collapse
> back into the sneaky groove. Weird, secretive, delightful and a little absurd. No
> vocals, no electronic drums.

## 12. Unit Creator workshop (loop) — role `creator`

> Instrumental playful, tinkering workshop music for a screen where players design
> their own silly soldiers, 112 BPM, C major, about 2 minutes, seamless loop.
> Bouncy pizzicato strings and marimba, a cheeky bassoon and clarinet duet, light
> xylophone runs, a ticking wood block, and soft hand claps on the off-beats. Now and
> then a little tuba "boing" or slide-whistle-like swoop on a trombone. Creative,
> curious and fun, like a mad inventor building a contraption. No vocals, no
> electronic sounds.

---

## Delivered

### Tribal planning theme (loop) — role `setup_tribal`, `anticipatory-tribal-groove.mp3` — ✅ delivered

> Instrumental sneaky, playful tribal planning music for a comedic war game where a
> chief quietly arranges his warriors before a battle, 100 BPM, D minor pentatonic,
> about 2 minutes, seamless loop with no intro and no ending. Soft hand drums and a
> muted log drum tapping a light, tip-toeing pattern, a breathy wooden flute and a
> bone-whistle-like piccolo trading a mischievous scheming melody, a low, quiet
> didgeridoo-like drone from soft low brass, and gentle shakers and clicking sticks
> keeping time. Pizzicato strings sneak along underneath, and a quiet tension builds in
> the middle with a rumbling frame-drum roll and held horns before it settles again.
> Thoughtful, cheeky and anticipatory, the calm before the stomp, never mocking any real
> culture. No vocals, no shouts, no electronic sounds.

### Second battle theme (loop) — role `battle_2`, `cavalry-battle-charge.mp3` — ✅ delivered

> Instrumental epic orchestral battle music for a comedic fantasy war game, 150 BPM, E
> minor, about 2 minutes 30 seconds, seamless loop with no intro and no ending, a
> different tune from the main battle theme for variety. Galloping 6/8 rhythm in the
> strings and snare like a cavalry charge, booming war drums and low brass hits,
> soaring high strings with a sweeping heroic melody, and horn calls bouncing between
> left and right. A breakdown in the middle with just thundering drums and staccato
> cellos, then a full orchestral build with cymbal swells into a massive climax that
> loops back to the start. Breathless, chaotic, exciting, like a huge clash of armies.
> No vocals, no electronic sounds.

### Medieval planning theme (loop) — role `setup_medieval`, `medieval-courtly-motif.mp3` — ✅ delivered

> Instrumental sneaky, playful medieval planning music for a comedic war game where a
> king and his generals plot over a map of the battlefield, 100 BPM, D Dorian, about 2
> minutes, seamless loop with no intro and no ending. A soft hurdy-gurdy drone, a lute
> picking a light walking line, a recorder and a crumhorn-like reed trading a
> mischievous scheming melody, a gently tapped tabor drum and a ticking wood block like
> a candle-lit war council. Pizzicato strings tip-toe underneath; in the middle a quiet
> tension builds with tremolo strings and a distant, muted brass fanfare before it
> relaxes again. Thoughtful, sly and courtly, the calm before the tournament turns into
> a brawl. No vocals, no electronic sounds.

### Wild West planning theme (loop) — role `setup_wildwest`, `wild-west-dusty-standoff.mp3` — ✅ delivered

> Instrumental sneaky, playful Wild West planning music for a comedic war game where a
> sheriff and his posse quietly take positions before a showdown, 96 BPM, A minor, about
> 2 minutes, seamless loop with no intro and no ending. A soft, twangy clean guitar
> picking a slow walking line, a lonely whistled-style tune on a high flute, a quiet
> harmonica, a gentle clip-clop wood block and soft brushed snare, and pizzicato strings
> tip-toeing underneath. In the middle a quiet standoff tension: a held string note, a
> ticking clock-like wood block and a single distant trumpet, then it relaxes again.
> Dusty, sly and anticipatory, the long stare before the draw. No vocals, no electronic
> sounds.

### Viking planning theme (loop) — role `setup_viking`, `viking-oars.mp3` — ✅ delivered

> Instrumental sneaky, playful Viking planning music for a comedic war game where a jarl
> plots a raid around the longhouse fire, 92 BPM, D minor, about 2 minutes, seamless
> loop with no intro and no ending. A soft droning bowed lyre and a quiet
> hardanger-style fiddle trading a mischievous scheming folk melody, a muted frame drum
> and a slow, heavy toms pattern like oars dipping quietly, a low lur-horn drone far
> away, and pizzicato low strings creeping underneath. In the middle a quiet tension
> builds with tremolo strings and a distant war horn before relaxing again. Hairy,
> cunning and anticipatory, the calm before the raid. No vocals, no shouts, no electronic
> sounds, no electric guitars.

### JJK planning theme (loop) — role `setup_jjk`, `jjk-scheming-motif.mp3` — ✅ delivered

> Instrumental sneaky, cool anime planning music for a comedic war game where sorcerers
> and curses take their positions in a neon city at night, 100 BPM (half-time feel),
> F# minor, about 2 minutes, seamless loop with no intro and no ending. A dark, quiet
> synth arpeggio and a soft muted electric guitar picking a scheming motif, a low
> slapping bass played gently, tight lo-fi hip-hop drums with a ticking hi-hat, an eerie
> detuned piano adding sly comments, and soft cinematic strings underneath. In the
> middle a quiet "domain" tension: everything drops to a low drone and a ticking clock
> before relaxing again. Cool, menacing and anticipatory, a little cursed, the calm
> before the fight. No vocals, no rap, no sung words.

### Avatar planning theme (loop) — role `setup_avatar`, `avatar-battle-plan.mp3` — ✅ delivered

> Instrumental sneaky, playful four-elements planning music for a comedic war game where
> benders and their allies take positions before a battle, 96 BPM, D minor pentatonic,
> about 2 minutes, seamless loop with no intro and no ending. A soft guzheng and pipa
> picking a light walking line, a dizi flute and an erhu trading a mischievous scheming
> melody, gentle gamelan metallophones and wind chimes, soft frame drums and a quiet
> taiko tap, and pizzicato strings tip-toeing underneath. A warm duduk takes a calm
> bridge, then a quiet tension builds with a distant Tibetan-style long horn and a low
> drum roll before relaxing again. Warm, clever and anticipatory, like a kids' adventure
> show plotting its big move. No vocals, no electronic sounds.

### Viking world battle theme (loop) — role `battle_viking`, `fierce-mischievous-vikings.mp3` — ✅ delivered


> Instrumental rowdy Viking battle music for the Norse world of a comedic war game
> (raiders, a jarl, valkyries, headbutting berserkers), 112 BPM, D minor, about 2
> minutes, seamless loop with no intro and no ending. Nordic folk meets a big
> orchestra: a droning bowed lyre and a hardanger-style fiddle playing a fierce folk
> melody, deep lur war horns, stomping feet and hand claps, heavy frame drums and
> pounding toms like oars hitting the water, and low strings and brass for the raid.
> A drunken mead-hall break in the middle: the fiddle turns into a lopsided, swaying
> jig with tankard-like thumps, before the war horns call everyone back for a
> thundering finale. Wild, hairy, beery and heroic. Wordless group shouts like "hey!"
> and "hoo!" are welcome; no sung words, no electronic sounds, no electric guitars.

### Dynasty world battle theme (loop) — role `battle_dynasty`, `wuxia-dynasty.mp3` — ✅ delivered


> Instrumental high-energy kung-fu and samurai battle music for the dynasty world of a
> comedic war game (samurai, ninjas, monks, firework archers, a hwacha rocket cart, a
> dragon), 144 BPM, about 2 minutes, seamless loop with no intro and no ending. Two
> clear halves that keep handing over. The Chinese half is a wuxia fight scene in the
> major pentatonic: a soaring erhu lead, a bright dizi bamboo flute, rapid pipa tremolo
> and guzheng glissandi, over Peking-opera percussion (the clacking wooden clapper,
> crashing bo cymbals and the rising "wang" of an opera gong) that speeds up and
> stops dead before each hit. The Japanese half is a samurai duel in the in (miyako-
> bushi) scale: a breathy shakuhachi with sharp bends, a plucked koto, a taiko
> ensemble with shouted "yo!" and "ha!" calls, and sudden silences broken by a single
> huge drum hit. A modern orchestra's strings and brass only reinforce the big
> moments. Fast, acrobatic and full of character, like a fight scene where everyone
> keeps striking poses. Respectful of both traditions, never a caricature. No sung
> words, no electronic sounds.

### JJK battle theme (loop) — role `battle_jjk`, `jjk-neon-night-arena.mp3` — ✅ delivered


> Instrumental high-octane anime battle music for a comedic war game's sorcerer faction
> fighting in a neon city at night, 160 BPM, F# minor, about 2 minutes, seamless loop
> with no intro and no ending. Modern anime-opening energy: fast palm-muted
> distorted electric guitars and a slapping bass, tight hip-hop and breakbeat drums
> trading with a big live rock kit, a dark synth arpeggio, and a cinematic string
> section and brass stabs for the huge moments. A sudden half-time "domain" breakdown:
> everything drops to a low drone, a ticking hi-hat and an eerie detuned piano, then
> a riser explodes into a double-time guitar riff and the main hook. Cool, menacing and
> hype, a little cursed. No vocals, no rap, no sung words.

### Avatar battle theme (loop) — role `battle_avatar`, `avatar-adventure.mp3` — ✅ delivered


> Instrumental adventurous four-elements battle music for a comedic war game's Avatar
> faction, 126 BPM, D minor pentatonic, about 2 minutes, seamless loop with no intro
> and no ending. A small world-music band leads and an orchestra supports: a bright
> dizi flute and an erhu trading the heroic main tune, a plucked guzheng and pipa, a
> warm duduk for a soulful bridge, Indonesian-style gamelan gongs and metallophones,
> frame drums and big taiko hits, and deep Tibetan-style long horns. Each section leans
> on one element: airy flutes and wind chimes, flowing harp and strings for water,
> heavy low drums and stomps for earth, fierce brass and fast percussion for fire, then
> all four join in a big finale. Heroic, warm and playful, like a kids' adventure show
> going into a big fight. No vocals, no electronic sounds.

### Main battle theme (loop) — role `battle`, `battle-1.mp3` — ✅ delivered

> Instrumental epic orchestral battle music for a comedic medieval fantasy war game,
> 140 BPM, D minor, about 2 minutes 30 seconds, built to loop seamlessly with no intro
> and no ending. Pounding timpani and taiko drums with a relentless driving string
> ostinato in the low strings, heroic French horns and trombones carrying a bold,
> memorable marching melody, and trumpets answering in short fanfare bursts. Halfway
> through, a cheeky section where bassoons and a tuba take over the melody in a
> slightly bumbling, comically pompous way over the same driving rhythm. Then the full
> orchestra crashes back in with cymbals and snare rolls for a huge, triumphant final
> statement that leads straight back to the start. Big, punchy, cinematic, high energy
> throughout, serious war-film intensity with a playful wink. No vocals, no choir, no
> electronic sounds.

### Army setup / planning theme (loop) — role `setup`, `setup-1.mp3` — ✅ delivered

> Instrumental sneaky, playful orchestral planning music for a comedic strategy war
> game where two generals secretly place their armies, 100 BPM, D minor, about 2
> minutes, seamless loop with no intro and no ending. Tip-toeing pizzicato strings
> carry the main tune over a soft, steady bass pizzicato walking line. Light
> woodwinds (clarinet and bassoon) trade a mischievous scheming melody. A muted
> trumpet adds the occasional sly comment. Soft snare brushes and a gentle tick of a
> wood block or clock keep time, and a quiet tension builds in the middle with
> tremolo strings before relaxing again. Thoughtful, clever and anticipatory, like
> plotting a cunning plan, and never loud enough to distract from concentrating. No
> vocals, no electronic sounds.

### Title / main menu theme (loop) — role `title`, `title.mp3` — ✅ delivered

> Instrumental jaunty, heroic oom-pah march for the main menu of a comedic medieval
> battle game, 116 BPM, F major, about 2 minutes, seamless loop with no fade. A brass
> band and orchestra together: a bouncy tuba and bass drum oom-pah, snare drum march
> rhythm, a proud, whistleable trumpet and horn melody, cheeky piccolo and glockenspiel
> flourishes, and big cymbal crashes at the end of each phrase. A middle section with
> a grand, swelling string version of the same melody, as if the game is taking itself
> far too seriously, then back to the bouncy march. Welcoming, catchy, confident and
> funny, the theme tune of the game. No vocals, no electronic sounds.

### Victory stinger — role `victory`, `victory.mp3` — ✅ delivered

> Instrumental short triumphant orchestral victory fanfare for a comedic battle game,
> about 8 seconds, one shot with a natural ending. A bold trumpet and horn fanfare in
> B-flat major over a timpani roll, a rising string run, a crashing cymbal, and a
> final big held major chord from the full orchestra with a satisfying last timpani
> hit. A tiny cheeky trill on the piccolo just before the last chord. Proud, glorious
> and slightly over the top. No vocals.

### Defeat stinger — role `defeat`, `defeat.mp3` — ✅ delivered

> Instrumental short comedic defeat sting for a battle game, about 7 seconds, one shot
> with a natural ending. A sad, deflating "wah-wah-wah-waaah" on a muted trombone
> descending in a minor key, a droopy bassoon underneath, a slow pizzicato pluck, and a
> final soft, wobbly low tuba note that fades out. Funny and sorry for itself rather
> than truly tragic. No vocals.

### Battle start horn and drums stinger — role `start`, `battle-start.mp3` — ✅ delivered

> Instrumental short battle-start sting for a comedic war game, about 4 seconds, one
> shot with a natural ending. A huge, slightly comical war horn blast, two massive
> taiko and timpani hits, a quick snare roll, and a full-orchestra "charge!" chord in D
> minor that cuts off cleanly. Loud, punchy and dramatic. Wordless "hey!" shouts from a
> group of soldiers are allowed. No sung words.

### Tribal Lands battle theme (loop) — role `battle_tribal`, `tribal-stomp.mp3` — ✅ delivered

> Instrumental energetic tribal battle music for the prehistoric-tribal world of a
> comedic war game, 132 BPM, D minor pentatonic, about 2 minutes, seamless loop with
> no intro or ending. Big hand drums, log drums and frame drums driving a stomping
> rhythm, wooden flutes and a bone-whistle-like piccolo carrying the melody, deep
> didgeridoo-like drones from low brass, and orchestral horns and strings swelling in
> for epic moments. Wordless group "hoo! hah!" shouts are fine. Primal, fun and
> stompy, never mocking any real culture. No sung words, no electronic sounds.

### Medieval Kingdom battle theme (loop) — role `battle_medieval`, `medieval-tournament-brawl.mp3` — ✅ delivered

> Instrumental medieval-flavoured battle music for the knights-and-castles world of a
> comedic war game, 138 BPM, D Dorian, about 2 minutes, seamless loop. A hurdy-gurdy
> and bagpipe-like drone, shawms and crumhorn-like woodwinds playing a rowdy dance
> melody, a hammering tabor drum, lute strums, and then a full modern orchestra with
> brass fanfares and string runs joining the same tune for a big heroic section.
> Rowdy, jolly and chivalrous, like a tournament turning into a brawl. No vocals.

### Pirate world battle theme (loop) — role `battle_pirate`, `sea-shanty-pirate-jig.mp3` — ✅ delivered

> Instrumental swashbuckling pirate battle music for a comedic war game, 6/8 time at
> about 150 BPM, D minor, about 2 minutes, seamless loop. A rollicking sea-shanty jig
> melody on fiddle and accordion, a bouncing tuba and pizzicato bass, a snare and bass
> drum like cannon fire, and the full orchestra with heroic brass and swirling strings
> taking over for an epic high-seas chorus. A drunken, swaying middle section on
> concertina and bassoon before the big return. Rowdy, adventurous and cheeky. Wordless
> "yo-ho"-style shouts allowed, no sung words.

### Wild West showdown theme (loop) — role `battle_wildwest`, `dusty-wild-west-showdown.mp3` — ✅ delivered

> Instrumental comedic Wild West showdown and battle music for a war game, 120 BPM, A
> minor, about 2 minutes, seamless loop. A twangy clean electric or acoustic guitar
> melody, a lonely whistled-style tune played on a high flute, a galloping snare and
> wood block rhythm, a harmonica wail, and a big orchestral brass section and
> trumpets in a dramatic duel style for the epic parts. A tense, quiet standoff
> section with only a guitar, a ticking clock-like wood block and a held string note
> before it explodes back into the gallop. Dusty, dramatic and funny. No vocals.
