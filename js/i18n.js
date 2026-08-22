/* Language: English + German. One flat dictionary per language, a tiny
   `t(key, vars)` lookup, and a few domain helpers (species names/hints,
   speed/pattern/grade labels) so the rest of the app never touches raw
   strings or picks a language itself. */

import { store } from './storage.js';

function detectDefault() {
  const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
  return nav.startsWith('de') ? 'de' : 'en';
}

let lang = store.get('lang') || detectDefault();
const listeners = new Set();

export function getLang() { return lang; }

export function setLang(next) {
  if (next !== 'en' && next !== 'de') return;
  if (next === lang) return;
  lang = next;
  store.set('lang', next);
  document.documentElement.lang = next;
  for (const fn of listeners) fn(next);
}

/** Name of the *other* language, in that language — the standard
    self-explanatory convention for a language-switch button. */
export function otherLangName() { return lang === 'en' ? 'Deutsch' : 'English'; }

export function onLangChange(fn) { listeners.add(fn); }

export function fmtNum(n) {
  return Math.round(n).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
}

/* ── Dictionary ──────────────────────────────────────────────────── */

const STR = {
  en: {
    title: {
      tagline: 'Every flower wants a different blade.<br>Cut it right, then bind the bouquet.',
      bestLine: 'Best bouquet run:',
      play: 'Start harvest',
      practice: 'Practice a flower',
      levels: 'Choose level',
      guide: 'Field guide',
      tutorial: 'How to cut',
      sound: 'Sound: {state}',
      soundOn: 'on',
      soundOff: 'off',
      fineprint: 'Works offline · add to your home screen',
      installPrompt: 'Tap to install on your home screen',
    },
    tutorial: {
      title: 'How to cut',
      steps: [
        '<b>Wait for the bloom.</b> Stems sprout, open, then wither. The ring around a flower closes as it peaks — cut on the bright ring.',
        '<b>Match the angle.</b> The badge on each stem shows the blade angle against the stem: <span class="ang">/</span> slanted 45°, <span class="ang">—</span> straight across, <span class="ang">\\</span> shallow 30°.',
        '<b>Hit the cut point.</b> A pale band marks where the stem should be severed. Low bands mean long stems for the vase.',
        '<b>Mind the speed.</b> Dots on the badge: one = slow and careful, two = steady, three = a fast snap.',
        '<b>Some stems need a shape.</b> A curve, a saw-toothed zigzag, or two crossing strokes for woody stems.',
        '<b>Leave the nettles alone.</b> Three stings and the round is over.',
      ],
      gotIt: 'Got it',
    },
    guide: {
      title: 'Field guide',
      back: 'Back',
      doNotCut: 'do not cut',
    },
    practice: {
      title: 'Practice a flower',
      subtitle: 'One stem at a time, centre of the field, no clock. The next one sprouts once you have cut the last.',
      back: 'Back',
      noCuts: 'no cuts yet',
      stats: { one: '{n} cut · avg {avg}% · best {best}%', other: '{n} cuts · avg {avg}% · best {best}%' },
    },
    levels: {
      title: 'Choose a level',
      subtitle: 'Jump straight into any round you have already reached.',
      back: 'Back',
      round: 'Round {n}',
      goal: 'Goal {n}',
      locked: 'Reach round {n} first',
    },
    pause: {
      title: 'Paused',
      resume: 'Resume',
      guide: 'Field guide',
      quit: 'Quit run',
    },
    bouquet: {
      roundTitle: 'Round {round} — {name}',
      total: 'Round total',
      nextRound: 'On to round {round}',
      seeResult: 'See the result',
      row: {
        emptyLabel: 'Empty handed', emptyNote: 'nothing was cut',
        craft: 'Cut craft', craftNote: '{pct}% clean stems',
        fullness: 'Fullness', fullnessNote: { one: '{n} stem', other: '{n} stems' },
        foliage: 'Foliage balance', foliageNone: 'no greenery at all', foliageNote: '{pct}% greens',
        variety: 'Variety', varietyNote: { one: '{n} species', other: '{n} species' },
        harmony: 'Stem harmony', harmonyEven: 'evenly matched lengths', harmonyUneven: 'uneven lengths',
        freshness: 'Freshness', freshnessNote: '{pct}% cut in bloom',
        unstung: 'Unstung', unstungNote: 'no weeds touched',
        stings: 'Stings', stingsNote: { one: '{n} weed cut', other: '{n} weeds cut' },
      },
      name: {
        sprig: 'A modest sprig',
        masterpiece: 'Florist’s masterpiece',
        cottage: 'Wild cottage mix',
        foliage: 'Foliage study',
        allBlooms: 'All blooms, no green',
        rustic: 'Rustic — very rustic',
        handsome: 'A handsome bouquet',
      },
    },
    over: {
      record: 'A record harvest',
      runOver: 'Run over',
      reasonStung: 'Three stings in round {round}. The nettles win this time.',
      reasonQuota: 'Round {round} needed {quota} points — you bound {total}.',
      total: 'Total',
      newBest: 'A new personal best.',
      reachedRound: 'Reached round {round} · best {best}',
      retry: 'Harvest again',
      home: 'Main menu',
    },
    hud: {
      score: 'Score', round: 'Round', time: 'Time',
      goal: 'Goal {n}', goalMet: 'Goal met',
      combo: 'combo',
      stems: 'stems',
    },
    rotate: 'Turn upright — the flowers grow tall.',
    grade: {
      immaculate: 'Immaculate', clean: 'Clean', good: 'Good', ragged: 'Ragged', butchered: 'Butchered',
    },
    note: {
      timingEarly: 'too early', timingLate: 'past its best', point: 'wrong height',
      angle: '{measured}° not {target}°', speed: 'needed {speed}',
      pattern: {
        arc: 'sweep a curve', zigzag: 'saw it, zigzag',
        cross: 'needs a second crossing stroke', straight: 'keep the stroke straight',
      },
    },
    label: { wilted: 'wilted', stung: 'stung!' },
    speed: {
      short: { slow: 'slow', steady: 'steady', fast: 'fast' },
      long: { slow: 'slow, controlled', steady: 'steady', fast: 'fast snap' },
    },
    pattern: {
      short: { straight: 'straight', arc: 'curve', zigzag: 'zigzag', cross: 'cross-cut' },
      long: { straight: 'straight stroke', arc: 'curved sweep', zigzag: 'zigzag saw', cross: 'two crossing strokes' },
    },
    angle: { any: 'any angle', toStem: '{n}° to stem' },
    point: { low: 'cut low', mid: 'cut mid', high: 'cut high' },
    kind: { flower: 'flower', green: 'green', hazard: 'hazard' },
  },

  de: {
    title: {
      tagline: 'Jede Blume verlangt nach einer anderen Klinge.<br>Schneide richtig, dann binde den Strauß.',
      bestLine: 'Bester Strauß:',
      play: 'Ernte starten',
      practice: 'Blume üben',
      levels: 'Level wählen',
      guide: 'Feldführer',
      tutorial: 'Schnitttechnik',
      sound: 'Ton: {state}',
      soundOn: 'an',
      soundOff: 'aus',
      fineprint: 'Funktioniert offline · zum Homescreen hinzufügen',
      installPrompt: 'Tippen, um zum Homescreen hinzuzufügen',
    },
    tutorial: {
      title: 'Schnitttechnik',
      steps: [
        '<b>Warte auf die Blüte.</b> Stängel treiben aus, öffnen sich und welken. Der Ring um eine Blume schließt sich am Höhepunkt — schneide auf dem hellen Ring.',
        '<b>Triff den Winkel.</b> Das Symbol am Stängel zeigt den Klingenwinkel zum Stängel: <span class="ang">/</span> schräg 45°, <span class="ang">—</span> quer, <span class="ang">\\</span> flach 30°.',
        '<b>Triff die Schnitthöhe.</b> Ein heller Streifen markiert, wo der Stängel durchtrennt werden soll. Tiefe Streifen ergeben lange Stiele für die Vase.',
        '<b>Achte auf das Tempo.</b> Punkte am Symbol: einer = langsam und vorsichtig, zwei = gleichmäßig, drei = ein schneller Schnitt.',
        '<b>Manche Stängel brauchen eine Form.</b> Eine Kurve, einen sägezahnartigen Zickzack oder zwei kreuzende Schnitte bei holzigen Stängeln.',
        '<b>Lass die Brennnesseln in Ruhe.</b> Drei Stiche und die Runde ist vorbei.',
      ],
      gotIt: 'Verstanden',
    },
    guide: {
      title: 'Feldführer',
      back: 'Zurück',
      doNotCut: 'nicht schneiden',
    },
    practice: {
      title: 'Blume üben',
      subtitle: 'Ein Stängel nach dem anderen, mittig im Feld, ohne Zeitdruck. Der nächste wächst, sobald du den letzten geschnitten hast.',
      back: 'Zurück',
      noCuts: 'noch keine Schnitte',
      stats: { one: '{n} Schnitt · Ø {avg}% · Beste {best}%', other: '{n} Schnitte · Ø {avg}% · Beste {best}%' },
    },
    levels: {
      title: 'Level wählen',
      subtitle: 'Starte direkt in einer bereits erreichten Runde.',
      back: 'Zurück',
      round: 'Runde {n}',
      goal: 'Ziel {n}',
      locked: 'Erst Runde {n} erreichen',
    },
    pause: {
      title: 'Pausiert',
      resume: 'Weiter',
      guide: 'Feldführer',
      quit: 'Lauf beenden',
    },
    bouquet: {
      roundTitle: 'Runde {round} — {name}',
      total: 'Rundensumme',
      nextRound: 'Weiter zu Runde {round}',
      seeResult: 'Ergebnis ansehen',
      row: {
        emptyLabel: 'Leer ausgegangen', emptyNote: 'nichts geschnitten',
        craft: 'Schnittqualität', craftNote: '{pct}% saubere Schnitte',
        fullness: 'Fülle', fullnessNote: { one: '{n} Stiel', other: '{n} Stiele' },
        foliage: 'Grünanteil', foliageNone: 'gar kein Grün', foliageNote: '{pct}% Grünzeug',
        variety: 'Vielfalt', varietyNote: { one: '{n} Art', other: '{n} Arten' },
        harmony: 'Stiellänge', harmonyEven: 'gleichmäßige Längen', harmonyUneven: 'ungleiche Längen',
        freshness: 'Frische', freshnessNote: '{pct}% in voller Blüte geschnitten',
        unstung: 'Ungestochen', unstungNote: 'kein Unkraut berührt',
        stings: 'Stiche', stingsNote: { one: '{n} Unkraut geschnitten', other: '{n} Unkräuter geschnitten' },
      },
      name: {
        sprig: 'Ein bescheidenes Sträußchen',
        masterpiece: 'Meisterwerk der Floristik',
        cottage: 'Wilder Bauerngarten-Mix',
        foliage: 'Grünstudie',
        allBlooms: 'Nur Blüten, kein Grün',
        rustic: 'Rustikal — sehr rustikal',
        handsome: 'Ein schöner Strauß',
      },
    },
    over: {
      record: 'Rekordernte',
      runOver: 'Lauf beendet',
      reasonStung: 'Drei Stiche in Runde {round}. Diesmal gewinnen die Brennnesseln.',
      reasonQuota: 'Runde {round} brauchte {quota} Punkte — du hast {total} gebunden.',
      total: 'Gesamt',
      newBest: 'Neuer persönlicher Rekord.',
      reachedRound: 'Runde {round} erreicht · Rekord {best}',
      retry: 'Erneut ernten',
      home: 'Hauptmenü',
    },
    hud: {
      score: 'Punkte', round: 'Runde', time: 'Zeit',
      goal: 'Ziel {n}', goalMet: 'Ziel erreicht',
      combo: 'Kombo',
      stems: 'Stiele',
    },
    rotate: 'Hochkant halten — die Blumen wachsen in die Höhe.',
    grade: {
      immaculate: 'Makellos', clean: 'Sauber', good: 'Gut', ragged: 'Zerrupft', butchered: 'Verschnitten',
    },
    note: {
      timingEarly: 'zu früh', timingLate: 'überreif', point: 'falsche Höhe',
      angle: '{measured}° statt {target}°', speed: '{speed} nötig',
      pattern: {
        arc: 'eine Kurve schwingen', zigzag: 'sägen, im Zickzack',
        cross: 'braucht einen zweiten, kreuzenden Schnitt', straight: 'gerade schneiden',
      },
    },
    label: { wilted: 'verwelkt', stung: 'gestochen!' },
    speed: {
      short: { slow: 'langsam', steady: 'gleichmäßig', fast: 'schnell' },
      long: { slow: 'langsam, kontrolliert', steady: 'gleichmäßig', fast: 'schneller Schnitt' },
    },
    pattern: {
      short: { straight: 'gerade', arc: 'Kurve', zigzag: 'Zickzack', cross: 'Kreuzschnitt' },
      long: { straight: 'gerader Schnitt', arc: 'geschwungener Schnitt', zigzag: 'Zickzack-Säge', cross: 'zwei kreuzende Schnitte' },
    },
    angle: { any: 'beliebiger Winkel', toStem: '{n}° zum Stängel' },
    point: { low: 'tief schneiden', mid: 'mittig schneiden', high: 'hoch schneiden' },
    kind: { flower: 'Blume', green: 'Grün', hazard: 'Gefahr' },
  },
};

/** German translations for species display text; species.js keeps the
    canonical English name/hint (and doubles as inline documentation), so
    only the German side needs to live here. */
const SPECIES_DE = {
  tulip: { name: 'Tulpe', hint: 'Weicher, hohler Stängel — ein langsamer, gerader Schnitt durch die Mitte.' },
  daisy: { name: 'Wiesen-Margerite', hint: 'Drahtig und nachsichtig — beliebiger Winkel, einfach hoch und schnell schnappen.' },
  nettle: { name: 'Brennnessel', hint: 'Unkraut. Niemals schneiden — drei Stiche beenden die Runde.' },
  fern: { name: 'Farnwedel', hint: 'Füllgrün — direkt am Boden abschneiden für einen langen Wedel.' },
  rose: { name: 'Gartenrose', hint: 'Holziger Trieb: ein 45°-Schräganschnitt tief unten, damit er trinken kann. Vorsicht, Dornen.' },
  eucalyptus: { name: 'Eukalyptus', hint: 'Biegsamer, silbriger Zweig — die Klinge in einer Kurve hindurchschwingen.' },
  sunflower: { name: 'Sonnenblume', hint: 'Dicker, faseriger Stängel — ein schneller, gerader Hieb ganz unten.' },
  lavender: { name: 'Lavendel', hint: 'Auf einem langen, flachen Schräganschnitt schneiden, schnell, bevor der Duft verfliegt.' },
  pampas: { name: 'Pampasgras', hint: 'Zäh und faserig — mit einem Zickzack-Schnitt durchsägen.' },
  bramble: { name: 'Brombeerranke', hint: 'Dornige Ranke. Stehen lassen.' },
  orchid: { name: 'Orchideenzweig', hint: 'Zerbrechlicher, bogiger Trieb — ein langsamer, schwungvoller Schnitt, sonst zersplittert er.' },
  hydrangea: { name: 'Hortensie', hint: 'Holzig: erst einschneiden, dann den Stängel mit einem zweiten, kreuzenden Schnitt spalten.' },
};

export function speciesName(sp) { return lang === 'de' ? (SPECIES_DE[sp.id]?.name ?? sp.name) : sp.name; }
export function speciesHint(sp) { return lang === 'de' ? (SPECIES_DE[sp.id]?.hint ?? sp.hint) : sp.hint; }

/* ── Lookup + formatting ─────────────────────────────────────────── */

function resolve(dict, key) {
  let node = dict;
  for (const p of key.split('.')) {
    node = node?.[p];
    if (node === undefined) return undefined;
  }
  return node;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

/** Look up `key` (dot path) in the current language, falling back to
    English so a missing translation never renders blank. */
export function t(key, vars) {
  let node = resolve(STR[lang], key);
  if (node === undefined) node = resolve(STR.en, key);
  if (node === undefined) return key;
  if (typeof node === 'string') return interpolate(node, vars);
  return node; // arrays / nested objects (e.g. tutorial.steps) — caller handles shape
}

/** Simple one/other pluraliser — English and German both split at n===1. */
export function plural(key, n, vars) {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { ...vars, n });
}

export function gradeName(grade) { return t(`grade.${grade.key}`); }
export function speedLabel(key) { return t(`speed.long.${key}`); }
export function speedLabelShort(key) { return t(`speed.short.${key}`); }
export function patternLabelLong(key) { return t(`pattern.long.${key}`); }
export function patternLabelShort(key) { return t(`pattern.short.${key}`); }
export function angleLabel(angle) { return angle == null ? t('angle.any') : t('angle.toStem', { n: angle }); }
export function pointBandLabel(point) {
  return point < 0.2 ? t('point.low') : point < 0.42 ? t('point.mid') : t('point.high');
}
export function kindLabel(kind) { return t(`kind.${kind}`); }

/** Turn a weakestPart() descriptor into localized popup text. */
export function weakNoteText(d) {
  if (!d) return '';
  switch (d.axis) {
    case 'timing': return t(d.early ? 'note.timingEarly' : 'note.timingLate');
    case 'point': return t('note.point');
    case 'angle': return t('note.angle', { measured: d.measured, target: d.target });
    case 'speed': return t('note.speed', { speed: speedLabel(d.speedKey) });
    case 'pattern': return t(`note.pattern.${d.patternKey}`);
    default: return '';
  }
}
