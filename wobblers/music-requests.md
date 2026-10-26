# Wobblers — music requests

**Status: 17 open requests; 3 delivered: #7 job complete, #8 job failed and #19 present found (ElevenLabs Music stingers, in the game). Full songs are made separately by the owner.** They are listed from most to least
important. The first five cover what players hear almost all the time: the island by
day, by night, and the title screen.

Today all of Wobblers' music is synthesised: the day and night background tunes in
`src/music.js` and two little jukebox tunes in `src/world/music.js`. Delivered tracks
will replace those, and the synth stays as the fallback for any track that hasn't
arrived. Wiring the files in is done when they are delivered (region themes switch
with `player.region`, the same hook as the "Welcome to ...!" banner).

Every prompt below is complete. Paste it into the generator as it is.

## How to deliver

- Put each file at `wobblers/assets/music/<file name>` (the name is given with each
  prompt). Use MP3 at 192 kbps or better, 44.1 kHz stereo.
- **Loops** must loop seamlessly. They need no fade-in, no fade-out and no reverb tail
  cut off at the end, and the last bar must lead straight back into the first. If the
  generator adds an intro or an ending, trim it.
- **Stingers** are one-shots with a natural ending. They may have a reverb tail.
- Everything is instrumental: no vocals, lyrics or spoken words. Whistling is fine
  where a prompt asks for it.
- Avoid imitating any existing game's soundtrack, film score or named artist.
- Record each track's prompt, generator and length in `assets/generation.json`, as
  for the images.

Shared feel: a cosy, cheerful open-world sandbox full of floppy ragdoll people,
cars, rides and little islands. The music is warm, bouncy and friendly, never
aggressive. It plays for hours under split-screen chaos, so it must stay pleasant on
repeat and leave room for engine noises, splashes and laughter.

---

## 1. Island daytime theme (loop) — `day-1.mp3`

> Instrumental cheerful, bouncy background music for a cosy open-world sandbox game
> about wobbly ragdoll people on a sunny island, 112 BPM, C major, about 3 minutes,
> built to loop seamlessly with no intro and no ending. Strummed ukulele and plucked
> acoustic guitar keep a light skipping rhythm, a warm marimba carries a simple,
> catchy, whistleable melody, a round upright bass bounces underneath, and soft
> shaker, woodblock and hand claps keep time. A playful whistled counter-melody joins
> in the second half, with little glockenspiel sparkles at the ends of phrases.
> Sunny, carefree and gently silly, like a lazy holiday afternoon, never loud or busy
> enough to tire the ear on repeat. No vocals, no electronic drums.

## 2. Island night theme (loop) — `night-1.mp3`

> Instrumental calm, cosy night-time background music for a gentle open-world sandbox
> game on a small island, 76 BPM, A minor drifting to C major, about 3 minutes, seamless
> loop with no intro and no ending. A soft music box and celesta play a slow,
> dreamy lullaby melody over warm felt piano chords and a soft string pad, with a
> gentle fingerpicked nylon guitar arpeggio and a quiet, breathy bass. Very light
> brushed percussion now and then, like distant crickets in rhythm. Peaceful,
> twinkly and a little sleepy, like walking home under the stars after a fun day,
> never sad or spooky. No vocals.

## 3. Title screen theme (loop) — `title.mp3`

> Instrumental upbeat, welcoming main menu theme for a funny, cosy open-world physics
> sandbox game with wobbly ragdoll characters, 118 BPM, F major, about 1 minute 45
> seconds, seamless loop with no fade. A bouncy tuba and pizzicato bass line, a jaunty
> ukulele and piano rhythm, a bright, singable lead on clarinet and glockenspiel, and
> a playful slide whistle and kazoo-like muted trumpet adding comic wobbles at the
> end of phrases. Snare brushes, tambourine and hand claps. A short middle section
> where a swelling string section plays the tune grandly, then tumbles back into the
> bouncy version. Catchy, friendly and a little goofy: the theme tune of the game.
> No vocals.

## 4. Second daytime theme (loop) — `day-2.mp3`

> Instrumental sunny, laid-back background music for a cosy open-world sandbox game
> on a holiday island, 100 BPM, G major, about 3 minutes, seamless loop with no intro
> and no ending, a different tune from the main day theme for variety. A light
> reggae-tinged offbeat ukulele skank, steel drums carrying a breezy melody, a warm
> bass guitar, soft congas and shaker, and a mellow flute answering the steel drums
> in the second half. Relaxed, smiling and easy-going, like driving slowly along the
> beach road with the windows down. No vocals, no electronic drums.

## 5. Second night theme (loop) — `night-2.mp3`

> Instrumental mellow late-evening background music for a cosy open-world sandbox
> game, 84 BPM, D major, about 3 minutes, seamless loop with no intro and no ending.
> Soft jazzy Rhodes electric piano chords, a brushed jazz drum kit, a warm walking
> upright bass and a gentle vibraphone melody, with a muted trumpet playing a few
> lazy, friendly phrases in the middle section. Warm streetlights, a quiet town square
> and fireflies: relaxed and content, not sleepy. No vocals.

## 6. Job theme (loop) — `job.mp3`

> Instrumental energetic, light-hearted "on the clock" music for timed delivery and
> rescue jobs in a comedic open-world sandbox game (pizza delivery, fire brigade,
> taxi fares), 138 BPM, E-flat major, about 2 minutes, seamless loop with no intro
> and no ending. A driving funky bass line, tight snare and hi-hat groove, punchy
> brass stabs, a ticking woodblock like a clock, and a busy, cheeky clarinet and
> xylophone melody that keeps hurrying forward. A short build with rising brass and
> snare rolls before looping. Urgent but fun, like a frantic cartoon chase where
> nobody gets hurt. No vocals.

## 7. Job complete stinger — `job-complete.mp3` — ✅ delivered

> Instrumental short, happy success jingle for finishing a job and getting paid in a
> cheerful sandbox game, about 5 seconds, one shot with a natural ending. A bright
> brass fanfare in B-flat major rising up the scale, a glockenspiel sparkle and a
> cash-register-like bell ding, a quick drum fill and a final big, bouncy major
> chord with a cymbal splash. Proud, satisfying and a bit cheesy. No vocals.

## 8. Job failed stinger — `job-failed.mp3` — ✅ delivered

> Instrumental short comedic "out of time" sting for failing a job in a cheerful
> sandbox game, about 4 seconds, one shot with a natural ending. A muted trombone
> slides down "wah-wah-waaah", a bassoon bumbles underneath, and it ends on a single
> soft, wobbly tuba note and a little slide whistle falling away. Funny and
> sheepish, never harsh or sad. No vocals.

## 9. Bigtown theme (loop) — `region-city.mp3`

> Instrumental upbeat, bustling city music for the big-city island of a cosy, comedic
> open-world sandbox game (skyscrapers, taxis, buses, a stadium), 120 BPM, B-flat
> major, about 2 minutes 30 seconds, seamless loop with no intro and no ending. A
> swinging big-band-lite groove: walking bass, brushed swing drums with crisp
> hi-hat, bright piano comping, a saxophone carrying a confident, catchy melody and
> a small brass section answering with friendly stabs. Car-horn-like trumpet blips
> as a playful joke now and then. Busy, sunny and sociable, like a cartoon
> metropolis at lunchtime. No vocals.

## 10. Frostpeak theme (loop) — `region-snow.mp3`

> Instrumental crisp, sparkling winter music for the snowy mountain island of a cosy
> open-world sandbox game (ski village, chairlift, frozen lake, snowball fights), 104
> BPM, D major, about 2 minutes 30 seconds, seamless loop with no intro and no
> ending. Jingling sleigh bells and a light pizzicato string rhythm, a glockenspiel
> and celesta melody that glitters like fresh snow, a warm French horn counter-melody
> and a gentle bouncing bassoon. Soft timpani swells under the bigger phrases. Fresh,
> playful and snug, like sledging then warming up with hot cocoa, without sounding
> like a Christmas carol. No vocals, no choir.

## 11. Dusty Dunes theme (loop) — `region-desert.mp3`

> Instrumental jaunty, sun-baked cowboy music for the wild-west desert island of a
> comedic open-world sandbox game (saloon, gold mine, tumbleweeds, dune buggies), 108
> BPM, A minor with a sunny major chorus, about 2 minutes 30 seconds, seamless loop with
> no intro and no ending. A clip-clop coconut-shell and woodblock horse-trot rhythm,
> a twangy acoustic guitar and banjo strumming, a lonesome but cheeky whistled
> melody, a harmonica answering it, and a plodding upright bass. A short honky-tonk
> piano break in the middle. Dusty, sunny and tongue-in-cheek, a cartoon western. No
> vocals.

## 12. Tiki Jungle theme (loop) — `region-jungle.mp3`

> Instrumental adventurous, playful jungle music for the volcano and temple island of
> a comedic open-world sandbox game (rope bridges, rapids, treehouses, a lava lake),
> 116 BPM, D minor turning to F major, about 2 minutes 30 seconds, seamless loop with
> no intro and no ending. Bouncy tribal-style hand drums, log drums and shakers, a
> wooden marimba and kalimba weaving a curious, exploring melody, a bamboo flute on
> top and a deep, rubbery bass. A brief mysterious passage with low hand drums and
> a soft flute before the cheerful groove returns. Adventurous and fun, like a
> cartoon treasure hunt, never dark or scary. No vocals.

## 13. Coconut Cove theme (loop) — `region-tropical.mp3`

> Instrumental breezy tropical beach music for the lagoon and resort island of a cosy
> open-world sandbox game (jet skis, surfing, a swim-up bar, a pirate shipwreck), 96
> BPM, E major, about 2 minutes 30 seconds, seamless loop with no intro and no
> ending. Gentle Hawaiian-style slide guitar and ukulele, soft steel drums, a light
> bossa-nova-tinged groove on congas, shaker and brushed snare, and a warm round
> bass. A dreamy vibraphone takes the melody in the middle section. Sunny,
> sparkling and completely relaxed, like floating on an inflatable in turquoise
> water. No vocals.

## 14. Fun Park theme (loop) — `funpark.mp3`

> Instrumental joyful fairground music for the fun park of a cosy, comedic sandbox
> game (ferris wheel, carousel, roller coaster, bumper cars), 126 BPM, C major,
> about 2 minutes, seamless loop with no intro and no ending. A cheerful band-organ
> (fairground organ) carrying a bouncy oom-pah waltz-turned-march melody, with
> glockenspiel, bass drum and cymbal hits, a tuba bass and little piccolo runs.
> Bright, spinning and giddy, like candy floss and carousel lights, never creepy.
> No vocals.

## 15. Race theme (loop) — `race.mp3`

> Instrumental exciting, comedic racing music for checkpoint races in a cosy sandbox
> game (dune buggy rally, downhill ski dash, jet ski ring race, river rapids), 150
> BPM, E minor, about 2 minutes, seamless loop with no intro and no ending. A fast
> galloping surf-rock guitar riff, a driving bass and energetic drums with lots of
> snare fills, punchy brass hits and a soaring, catchy trumpet melody. A short
> breakdown with just drums and bass before it charges back. Thrilling and silly,
> like a cartoon road race. No vocals.

## 16. Jukebox song 1 (loop) — `jukebox-1.mp3`

> Instrumental retro 1950s rock-and-roll diner jukebox song for a cosy comedic sandbox
> game, 160 BPM, A major, about 2 minutes, seamless loop with no intro and no ending.
> A boogie-woogie piano, slap-back upright bass, a twangy electric guitar riff,
> honking tenor saxophone carrying a catchy melody, and a swinging shuffle drum beat
> with hand claps. Toe-tapping, sunny and full of fun, the kind of song ragdoll
> people would flop around dancing to. No vocals.

## 17. Jukebox song 2 (loop) — `jukebox-2.mp3`

> Instrumental groovy 1970s disco-funk jukebox song for a cosy comedic sandbox game,
> 118 BPM, D minor, about 2 minutes, seamless loop with no intro and no ending. A
> four-on-the-floor kick with open hi-hats, a bouncy octave bass line, choppy funk
> guitar, lush string swells, a bright brass section riff and a catchy
> electric piano melody. Irresistibly danceable and cheerful, a dance-floor filler
> in a small-town cafe. No vocals.

## 18. Ferry crossing theme (loop) — `ferry.mp3`

> Instrumental gentle, rolling sea-voyage music for riding a ferry between islands in
> a cosy open-world sandbox game, 88 BPM in 6/8, G major, about 2 minutes, seamless
> loop with no intro and no ending. A swaying accordion and fiddle carry a warm,
> sea-shanty-flavoured melody, with a lilting acoustic guitar, a soft upright bass
> and light bodhrán-style frame drum. A tin whistle answers the accordion in the
> second half. Breezy, salty and content, like watching the next island get closer.
> No vocals.

## 19. Present found stinger — `present.mp3` — ✅ delivered

> Instrumental short magical "you found a present" jingle for unlocking a new hat or
> outfit in a cosy sandbox game, about 3 seconds, one shot with a natural ending. A
> quick ascending harp glissando, a twinkling glockenspiel and celesta motif in C
> major, a soft cymbal shimmer, and a final bright bell chord. Delightful and
> surprising, like opening a gift. No vocals.

## 20. Underwater / snorkel reef theme (loop) — `underwater.mp3`

> Instrumental dreamy, floating underwater music for snorkelling over a coral reef in
> a cosy open-world sandbox game, 70 BPM, E-flat major, about 2 minutes, seamless loop
> with no intro and no ending. Soft, bubbling marimba and vibraphone arpeggios, a
> slow, wavering harp, a gentle warm pad and a low, rounded bass, with a soft flute
> melody drifting over the top. Weightless, peaceful and full of wonder, with fish
> and turtles drifting past. No vocals, no percussion beyond a light shaker.
