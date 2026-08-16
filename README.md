# Bloom & Blade

A mobile browser game about **cutting flowers properly**. Stems sprout from the
soil, grow, bloom and wither on a clock. You harvest them with a swipe — but
every species wants a different cut, and the game measures all of it: the angle
of the blade against the stem, where on the stem it lands, how fast you moved,
the shape of the stroke, and whether the bloom was actually ready. At the end of
each round the harvest is bound into a bouquet and scored on composition.

It is a PWA: one static folder, no build step, no network calls, installable to
a home screen and fully playable offline.

---

## Playing

Stems sprout from the ground and run through a life cycle — sprout, grow, bud,
**bloom**, wilt, spent. Two overlays teach you what to do:

**The ring** around each bloom is its clock. The pale band on the ring is the
window where the flower is at its best; the moving arc is where it is now. Cut
on the band.

**The guide stroke** crossing the stem is the technique, drawn literally: it is
angled at the angle you must swipe, it sits at the height you must cut, it is
*shaped* like the stroke you must make, and the dots on its end tell you the
speed — one dot slow, two steady, three a fast snap. Trace it and you score.

| | Technique |
|---|---|
| **Tulip** | Slow, straight across the middle of a soft hollow stem |
| **Ox-eye Daisy** | Any angle, but fast and high — a wiry snap |
| **Fern Frond** | Steady, square, right down at the base |
| **Garden Rose** | A 45° slant low on the woody cane |
| **Eucalyptus** | A curved sweep through the bendy sprig |
| **Sunflower** | One fast square chop through the thick stalk |
| **Lavender** | A long shallow 30° slant, fast |
| **Pampas Grass** | Saw it — a zigzag stroke through the fibres |
| **Orchid Spray** | Slow and curving, or the fragile cane shatters |
| **Hydrangea** | Slice it, then split it with a second crossing stroke |
| **Nettle / Bramble** | Weeds. Cut three and the round ends. |

A cut is graded on five things, and the two that hurt most are the ones players
overlook: **timing gates everything** (a flawless cut through a closed bud is
still a ruined flower), and **the weakest criterion drags the rest down** — three
things right does not excuse the fourth.

Between rounds the stems you cut are bound into a bouquet and scored again on
composition: cut craft, fullness, how much foliage you mixed in, variety, how
evenly the stem lengths match, and freshness. Clear the round's goal to carry on;
each round is faster, adds species, and raises the bar.

---

## Running it

Any static server will do — the game is plain ES modules with no dependencies:

```sh
npx http-server -p 8123 -c-1
# then open http://localhost:8123
```

A service worker caches the whole shell on first load, so after one visit it runs
with the network off. For install-to-home-screen and the service worker to work,
serve it over HTTPS (or `localhost`).

Regenerating the icon set (they are committed, so this is only needed if you
change the mark):

```sh
node tools/make-icons.mjs
```

---

## How it is put together

No framework, no bundler. One canvas, a handful of ES modules:

| File | What lives there |
|---|---|
| `js/game.js` | State machine: spawning, slicing, rounds, bouquets |
| `js/species.js` | Every plant — looks, life span, and the technique it demands |
| `js/flower.js` | One plant: life cycle, stem geometry, guide overlay, the cut piece |
| `js/gesture.js` | Blade input, stroke capture, and gesture-shape analysis |
| `js/scoring.js` | Turning a measured swipe into a grade |
| `js/bouquet.js` | Composition scoring and the animated arrangement |
| `js/draw.js` | Procedural stem and flower-head rendering |
| `js/scene.js` | The garden background, baked once per resize |
| `js/particles.js`, `js/audio.js`, `js/ui.js`, `js/scene.js` | Feedback and chrome |
| `js/config.js` | Every tuning number worth arguing about |

**Slicing.** Each blade segment is intersected against a sampled quadratic-bezier
stem. On contact the plant is severed immediately — the head flies off and drifts
to the basket — while the *grade* is settled a moment later, once the stroke has
finished and its shape can be analysed. Direction and speed are sampled at the
instant of contact; stroke shape needs the whole gesture.

**Gesture shapes.** A stroke is resampled to even spacing and reduced to total
turning, net turning and the number of real direction reversals, which separates
a straight slice from a curve from a saw. A sawing stroke has no meaningful
instantaneous angle, so for zigzag species the blade angle is measured from where
the whole stroke travelled instead.

**Guide overlays are honest.** Every guide shape passes through its own origin, so
a player tracing it lands the blade on the marked point at the marked angle — the
picture is the specification, not a decoration.

**Art is code.** Flowers, background and app icons are all drawn procedurally;
the repo carries no binary art beyond the generated PNG icons.

## Licence

MIT — see `LICENSE`.
