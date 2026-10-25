# Wobbly Battles — music requests

**Status: 14 open requests; 6 delivered: #1 battle, #2 setup and #3 title (owner-made songs), and #4 victory, #5 defeat and #11 battle start (ElevenLabs Music stingers). All six are in the game.** They are listed from most to least
important: the first five cover what players hear most of the time.

The title, setup and battle music and three stingers are recorded files; the rest of
the music is still synthesised in `src/audio.js`. Delivered songs don't need to loop
seamlessly: the game crossfades from just before the song's ending back to the start
(`TRACKS[mode].loop` in `src/audio.js`). Delivered tracks will replace those loops, and the synth stays as the fallback
for any track that hasn't arrived. Wiring the files in is done when they are
delivered.

## How to deliver

- Put each file at `battles/assets/music/<file name>` (the name is given with each
  prompt). Use MP3 at 192 kbps or better, 44.1 kHz stereo.
- **Loops** must loop seamlessly. They need no fade-in, no fade-out and no reverb tail
  cut off at the end, and the last bar must lead straight back into the first. If the
  generator adds an intro or an ending, trim it, or deliver it separately as
  `<name>-intro.mp3`.
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

## 1. Main battle theme (loop) — `battle-1.mp3` — ✅ delivered

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

## 2. Army setup / planning theme (loop) — `setup-1.mp3` — ✅ delivered

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

## 3. Title / main menu theme (loop) — `title.mp3` — ✅ delivered

> Instrumental jaunty, heroic oom-pah march for the main menu of a comedic medieval
> battle game, 116 BPM, F major, about 2 minutes, seamless loop with no fade. A brass
> band and orchestra together: a bouncy tuba and bass drum oom-pah, snare drum march
> rhythm, a proud, whistleable trumpet and horn melody, cheeky piccolo and glockenspiel
> flourishes, and big cymbal crashes at the end of each phrase. A middle section with
> a grand, swelling string version of the same melody, as if the game is taking itself
> far too seriously, then back to the bouncy march. Welcoming, catchy, confident and
> funny, the theme tune of the game. No vocals, no electronic sounds.

## 4. Victory stinger — `victory.mp3` — ✅ delivered

> Instrumental short triumphant orchestral victory fanfare for a comedic battle game,
> about 8 seconds, one shot with a natural ending. A bold trumpet and horn fanfare in
> B-flat major over a timpani roll, a rising string run, a crashing cymbal, and a
> final big held major chord from the full orchestra with a satisfying last timpani
> hit. A tiny cheeky trill on the piccolo just before the last chord. Proud, glorious
> and slightly over the top. No vocals.

## 5. Defeat stinger — `defeat.mp3` — ✅ delivered

> Instrumental short comedic defeat sting for a battle game, about 7 seconds, one shot
> with a natural ending. A sad, deflating "wah-wah-wah-waaah" on a muted trombone
> descending in a minor key, a droopy bassoon underneath, a slow pizzicato pluck, and a
> final soft, wobbly low tuba note that fades out. Funny and sorry for itself rather
> than truly tragic. No vocals.

## 6. Second battle theme (loop) — `battle-2.mp3`

> Instrumental epic orchestral battle music for a comedic fantasy war game, 150 BPM, E
> minor, about 2 minutes 30 seconds, seamless loop with no intro and no ending, a
> different tune from the main battle theme for variety. Galloping 6/8 rhythm in the
> strings and snare like a cavalry charge, booming war drums and low brass hits,
> soaring high strings with a sweeping heroic melody, and horn calls bouncing between
> left and right. A breakdown in the middle with just thundering drums and staccato
> cellos, then a full orchestral build with cymbal swells into a massive climax that
> loops back to the start. Breathless, chaotic, exciting, like a huge clash of armies.
> No vocals, no electronic sounds.

## 7. Final moments / slow-motion replay theme (loop) — `final-moments.mp3`

> Instrumental slow, grand and mock-tragic orchestral music for the slow-motion replay
> of the last moments of a comedic battle, 60 BPM, C minor, about 1 minute 30
> seconds, seamless loop. Long, swelling, emotional strings play a soaring, noble
> melody over deep sustained basses. Slow, heavy timpani strikes land like
> slow-motion impacts, and a solo French horn answers with a heroic, sorrowful line.
> The whole thing is played with complete seriousness, like the most dramatic moment
> of a war film, so that wobbly soldiers flying through the air in slow motion look
> hilarious. No vocals, no choir, no electronic sounds.

## 8. Replay / spectator theme (loop) — `replay.mp3`

> Instrumental relaxed, cheerful orchestral music for watching battle replays in a
> comedic war game, 96 BPM, G major, about 2 minutes, seamless loop. Light,
> rhythmic strings and a bouncing bassoon line, a friendly clarinet melody, gentle
> snare and triangle, and a warm horn counter-melody in the second half. It should
> feel like reviewing the highlights with a cup of tea: amused, proud, unhurried and
> not distracting. No vocals, no electronic sounds.

## 9. Campaign map / level select (loop) — `campaign-map.mp3`

> Instrumental adventurous orchestral map music for choosing the next level of a
> comedic war campaign, 108 BPM, A major, about 2 minutes, seamless loop. A
> journeying feel: steady marching snare and pizzicato bass, a wandering, hopeful
> flute and oboe melody, horns rising on the big phrase, and a harp and glockenspiel
> sparkle. A short middle section on solo accordion and strings, like looking at an
> old map in a tavern, then the full orchestra returns. Curious, optimistic and
> ready for adventure. No vocals, no electronic sounds.

## 10. Unit Creator workshop (loop) — `creator.mp3`

> Instrumental playful, tinkering workshop music for a screen where players design
> their own silly soldiers, 112 BPM, C major, about 2 minutes, seamless loop.
> Bouncy pizzicato strings and marimba, a cheeky bassoon and clarinet duet, light
> xylophone runs, a ticking wood block, and soft hand claps on the off-beats. Now and
> then a little tuba "boing" or slide-whistle-like swoop on a trombone. Creative,
> curious and fun, like a mad inventor building a contraption. No vocals, no
> electronic sounds.

## 11. Battle start horn and drums stinger — `battle-start.mp3` — ✅ delivered

> Instrumental short battle-start sting for a comedic war game, about 4 seconds, one
> shot with a natural ending. A huge, slightly comical war horn blast, two massive
> taiko and timpani hits, a quick snare roll, and a full-orchestra "charge!" chord in D
> minor that cuts off cleanly. Loud, punchy and dramatic. Wordless "hey!" shouts from a
> group of soldiers are allowed. No sung words.

## 12. Tribal Lands battle theme (loop) — `world-tribal.mp3`

> Instrumental energetic tribal battle music for the prehistoric-tribal world of a
> comedic war game, 132 BPM, D minor pentatonic, about 2 minutes, seamless loop with
> no intro or ending. Big hand drums, log drums and frame drums driving a stomping
> rhythm, wooden flutes and a bone-whistle-like piccolo carrying the melody, deep
> didgeridoo-like drones from low brass, and orchestral horns and strings swelling in
> for epic moments. Wordless group "hoo! hah!" shouts are fine. Primal, fun and
> stompy, never mocking any real culture. No sung words, no electronic sounds.

## 13. Medieval Kingdom battle theme (loop) — `world-medieval.mp3`

> Instrumental medieval-flavoured battle music for the knights-and-castles world of a
> comedic war game, 138 BPM, D Dorian, about 2 minutes, seamless loop. A hurdy-gurdy
> and bagpipe-like drone, shawms and crumhorn-like woodwinds playing a rowdy dance
> melody, a hammering tabor drum, lute strums, and then a full modern orchestra with
> brass fanfares and string runs joining the same tune for a big heroic section.
> Rowdy, jolly and chivalrous, like a tournament turning into a brawl. No vocals.

## 14. Ancient & Viking world battle theme (loop) — `world-ancient.mp3`

> Instrumental epic ancient-world battle music for a comedic war game world of
> legionaries, hoplites and vikings, 128 BPM, E Phrygian, about 2 minutes 30 seconds,
> seamless loop. Massive low brass and tubas, frame drums and a booming bass drum
> beating like oars, a double-reed duduk-like woodwind and a lyre-like harp playing an
> old-world melody, and a Nordic section with a stomping rhythm, a fiddle and a deep
> war horn. The full orchestra builds to a colossal finale that loops back. Grand,
> ancient and heroic, with a hint of humour. Wordless "hey!" shouts allowed, no sung
> words.

## 15. Dynasty world battle theme (loop) — `world-dynasty.mp3`

> Instrumental energetic East Asian–inspired orchestral battle music for the dynasty
> world of a comedic war game, 140 BPM, pentatonic minor, about 2 minutes, seamless
> loop. Booming taiko-style ensemble drums, a bright bamboo flute leading a heroic
> melody, plucked zither and pipa-like strings in rapid tremolo, gongs and cymbal
> crashes, and a Western orchestra's strings and brass supporting the big moments.
> Respectful, heroic and exciting, never a caricature. No vocals, no electronic
> sounds.

## 16. Pirate world battle theme (loop) — `world-pirate.mp3`

> Instrumental swashbuckling pirate battle music for a comedic war game, 6/8 time at
> about 150 BPM, D minor, about 2 minutes, seamless loop. A rollicking sea-shanty jig
> melody on fiddle and accordion, a bouncing tuba and pizzicato bass, a snare and bass
> drum like cannon fire, and the full orchestra with heroic brass and swirling strings
> taking over for an epic high-seas chorus. A drunken, swaying middle section on
> concertina and bassoon before the big return. Rowdy, adventurous and cheeky. Wordless
> "yo-ho"-style shouts allowed, no sung words.

## 17. Wild West showdown theme (loop) — `world-wildwest.mp3`

> Instrumental comedic Wild West showdown and battle music for a war game, 120 BPM, A
> minor, about 2 minutes, seamless loop. A twangy clean electric or acoustic guitar
> melody, a lonely whistled-style tune played on a high flute, a galloping snare and
> wood block rhythm, a harmonica wail, and a big orchestral brass section and
> trumpets in a dramatic duel style for the epic parts. A tense, quiet standoff
> section with only a guitar, a ticking clock-like wood block and a held string note
> before it explodes back into the gallop. Dusty, dramatic and funny. No vocals.

## 18. Renaissance & Spooky world theme (loop) — `world-spooky.mp3`

> Instrumental spooky, mischievous orchestral battle music for a comedic war game
> world of skeletons, reapers and renaissance inventors, 132 BPM, C minor, about 2
> minutes, seamless loop. A dramatic pipe organ and harpsichord playing a fast, sinister
> but silly melody, xylophone "rattling bones" runs, pizzicato strings, a bassoon and
> tuba bumbling along, and the full orchestra with brass stabs and timpani for a big,
> gothic climax. Halloween-party spooky rather than frightening. No vocals, no
> wordless choir, no electronic sounds.

## 19. Good & Evil world battle theme (loop) — `world-goodevil.mp3`

> Instrumental colossal good-versus-evil orchestral battle music for the final world of
> a comedic war game, 136 BPM, alternating between D minor and D major, about 2 minutes
> 30 seconds, seamless loop. A dark, menacing section with low brass, pounding drums,
> a sinister organ and rumbling double basses, answered by a radiant, heavenly section
> with bright trumpets, a harp, shimmering high strings and bells. The two sides
> battle back and forth, then combine into a huge, over-the-top finale. Divine, demonic
> and absurdly epic. No vocals, no choir singing words, no electronic sounds.

## 20. Secret Stash bonus theme (loop) — `world-secret.mp3`

> Instrumental quirky, mysterious bonus-level music for the secret world of a comedic
> war game, 118 BPM, F minor with surprising key changes, about 2 minutes, seamless
> loop. A playful mix of an orchestra and odd instruments: a theremin-like glissando
> violin, a toy piano, a muted trumpet, pizzicato strings, a bouncing tuba and a
> swinging snare brush beat. Brief bursts of a grand, heroic orchestra that collapse
> back into the sneaky groove. Weird, secretive, delightful and a little absurd. No
> vocals, no electronic drums.
