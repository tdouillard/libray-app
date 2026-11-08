import type { DetectedSpine } from "./shelfSearch";

/**
 * Shelf photo analysis on top of an OCR engine (Tesseract). Pure logic, no DOM: the engine is injected so the
 * same code runs in the browser (canvas) and in tests.
 *
 * Tesseract cannot read a stylised title reliably, but it can read *some* of it on *some* spines. So the photo
 * is not read once: it is turned into spine columns first, then every column is read several times and the
 * readings are voted on.
 *   1. A short, clean, repeated text (the publisher logo, usually) is found by OCR, then located on every
 *      other spine by template matching. That gives one column per spine, even for spines OCR cannot read.
 *   2. Each column is OCR'd with several preprocessings; the words are pooled across columns and clustered by
 *      spelling. The cluster seen on the most spines, with the biggest letters, is the series title.
 *   3. The volume numbers are read per column, then repaired using the fact that a run of volumes on a shelf
 *      is consecutive.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  /** 0-100, as reported by Tesseract. */
  confidence: number;
  /** In the coordinates of the oriented shelf image. */
  box: Box;
}

export type Prep = "grey" | "green" | "bin";

export interface OcrOptions {
  psm: "6" | "7" | "8" | "10" | "11" | "13";
  digits?: boolean;
  prep: Prep;
  /** Upscaling applied to the region before OCR. */
  scale: number;
}

export interface GrayImage {
  width: number;
  height: number;
  /** gray pixel = full-resolution pixel * scale */
  scale: number;
  data: ArrayLike<number>;
}

export interface ShelfEngine {
  /** Size of the oriented shelf image. */
  width: number;
  height: number;
  gray(maxSide: number): GrayImage;
  ocr(box: Box, options: OcrOptions): Promise<OcrWord[]>;
}

/* ------------------------------------------------------------------ text helpers */

export const normToken = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const letterCount = (text: string) => (text.match(/\p{L}/gu) ?? []).length;

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** 1 = same spelling, 0 = nothing in common (accents, case and punctuation ignored). */
export function editSimilarity(a: string, b: string): number {
  const x = normToken(a);
  const y = normToken(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** How well `fragment` fits somewhere inside `whole` (approximate substring match): "bord" fits "vagabond". */
export function fragmentSimilarity(fragment: string, whole: string): number {
  const f = normToken(fragment);
  const w = normToken(whole);
  if (!f || !w) return 0;
  // Sellers' algorithm: edit distance of `f` against any substring of `w`.
  let previous = Array.from({ length: w.length + 1 }, () => 0);
  for (let i = 1; i <= f.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= w.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (f[i - 1] === w[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - Math.min(...previous) / f.length;
}

/** Words printed on spines that are not part of a title (publishers, imprints, edition names). */
const NOISE_WORDS = [
  "vizbig", "viz", "media", "edition", "editions", "glenat", "kana", "kurokawa", "pika", "kioon", "panini", "dargaud",
  "dupuis", "casterman", "delcourt", "soleil", "tonkam", "shueisha", "kodansha", "kadokawa", "seinen", "shonen",
  "shojo", "tome", "volume", "manga", "collection",
];

/** Edition names worth adding to a catalogue search: they pick the right edition of a series. */
const EDITION_HINTS = ["vizbig", "deluxe", "integrale", "perfect", "ultimate", "kanzenban", "collector"];

export function isNoiseToken(text: string): boolean {
  const token = normToken(text);
  if (token.length < 4) return true;
  return NOISE_WORDS.some((noise) => token === noise || editSimilarity(token, noise) >= 0.75 || (noise.length >= token.length && fragmentSimilarity(token, noise) >= 0.74));
}

export function editionHint(words: OcrWord[]): string | undefined {
  for (const word of words) {
    if (word.confidence < 40) continue;
    const hint = EDITION_HINTS.find((candidate) => editSimilarity(word.text, candidate) >= 0.75);
    if (hint) return hint.toUpperCase();
  }
  return undefined;
}

/** "Dragon Ball 12" -> { title: "Dragon Ball", volume: 12 }; null for OCR noise. */
export function parseSpineLine(raw: string): DetectedSpine | null {
  const cleaned = raw.replace(/[|_~=\\/<>[\]{}*^]+/g, " ").replace(/\s+/g, " ").trim();
  const letters = letterCount(cleaned);
  // OCR noise is mostly symbols and single characters: keep lines that are mostly letters.
  if (letters < 4 || letters / cleaned.replace(/\s/g, "").length < 0.7) return null;

  const withVolume = cleaned.match(/^(.*?\p{L}.*?)[\s,.:-]+(?:(?:tome|t|vol(?:ume)?|#)\.?\s*)?(\d{1,3})$/iu);
  if (withVolume) return { title: withVolume[1].trim(), volume: Number(withVolume[2]) };
  return { title: cleaned };
}

/** Groups words that sit on the same text line (reading left to right). */
export function wordsToLines(words: OcrWord[]): string[] {
  const sorted = [...words].sort((a, b) => (a.box.y0 + a.box.y1) / 2 - (b.box.y0 + b.box.y1) / 2);
  const lines: { cy: number; h: number; words: OcrWord[] }[] = [];
  for (const word of sorted) {
    const cy = (word.box.y0 + word.box.y1) / 2;
    const h = word.box.y1 - word.box.y0;
    const line = lines.find((l) => Math.abs(l.cy - cy) < 0.6 * Math.max(l.h, h));
    if (line) line.words.push(word);
    else lines.push({ cy, h, words: [word] });
  }
  return lines.map((l) => l.words.sort((a, b) => a.box.x0 - b.box.x0).map((w) => w.text).join(" "));
}

/** How readable a whole-photo OCR pass is: used to find which way up the text is. */
export function orientationScore(words: OcrWord[]): number {
  return words.reduce((sum, w) => (w.confidence >= 60 ? sum + Math.min(letterCount(w.text), 10) : sum), 0);
}

/* ------------------------------------------------------------------ preprocessing */

/** Grey/green channel with the contrast stretched to the full range (optionally binarised). */
export function prepareGray(rgb: ArrayLike<number>, pixels: number, stride: 3 | 4, prep: Prep): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < pixels; i += 1) {
    const r = rgb[i * stride];
    const g = rgb[i * stride + 1];
    const b = rgb[i * stride + 2];
    const v = prep === "grey" ? Math.round(0.299 * r + 0.587 * g + 0.114 * b) : g;
    out[i] = v;
    histogram[v] += 1;
  }
  const percentile = (fraction: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += histogram[v];
      if (seen >= pixels * fraction) return v;
    }
    return 255;
  };
  const lo = percentile(0.01);
  const hi = Math.max(percentile(0.99), lo + 1);
  for (let i = 0; i < pixels; i += 1) {
    const stretched = Math.max(0, Math.min(255, ((out[i] - lo) * 255) / (hi - lo)));
    out[i] = prep === "bin" ? (stretched >= 120 ? 255 : 0) : stretched;
  }
  return out;
}

/* ------------------------------------------------------------------ repeated-pattern detection */

export interface TemplateMatch {
  box: Box;
  /** Normalised cross-correlation, 1 = identical. */
  score: number;
}

/**
 * Finds the places in a horizontal band that look like the `template` region (normalised cross-correlation).
 * `tolerance` is how far, in full-resolution pixels, a match may sit above or below the template.
 */
export function matchTemplate(image: GrayImage, template: Box, tolerance: number, minScore: number): TemplateMatch[] {
  const s = image.scale;
  const tx = Math.round(template.x0 * s);
  const ty = Math.round(template.y0 * s);
  const tw = Math.max(4, Math.round((template.x1 - template.x0) * s));
  const th = Math.max(4, Math.round((template.y1 - template.y0) * s));
  if (tx < 0 || ty < 0 || tx + tw > image.width || ty + th > image.height) return [];

  const pixels = tw * th;
  const t = new Float64Array(pixels);
  let tMean = 0;
  for (let y = 0; y < th; y += 1) for (let x = 0; x < tw; x += 1) tMean += t[y * tw + x] = image.data[(ty + y) * image.width + tx + x];
  tMean /= pixels;
  let tNorm = 0;
  for (let i = 0; i < pixels; i += 1) {
    t[i] -= tMean;
    tNorm += t[i] * t[i];
  }
  tNorm = Math.sqrt(tNorm);
  if (tNorm < 1) return []; // flat template: nothing to match

  const found: Array<{ x: number; y: number; score: number }> = [];
  const tol = Math.round(tolerance * s);
  for (let y0 = Math.max(0, ty - tol); y0 <= Math.min(image.height - th, ty + tol); y0 += 1) {
    for (let x0 = 0; x0 <= image.width - tw; x0 += 1) {
      let mean = 0;
      for (let y = 0; y < th; y += 1) for (let x = 0; x < tw; x += 1) mean += image.data[(y0 + y) * image.width + x0 + x];
      mean /= pixels;
      let correlation = 0;
      let energy = 0;
      let i = 0;
      for (let y = 0; y < th; y += 1) {
        for (let x = 0; x < tw; x += 1, i += 1) {
          const v = image.data[(y0 + y) * image.width + x0 + x] - mean;
          correlation += v * t[i];
          energy += v * v;
        }
      }
      const score = correlation / (Math.sqrt(energy) * tNorm + 1e-9);
      if (score >= minScore) found.push({ x: x0, y: y0, score });
    }
  }

  found.sort((a, b) => b.score - a.score);
  const kept: typeof found = [];
  for (const candidate of found) {
    if (kept.every((k) => Math.abs(k.x - candidate.x) > tw * 0.6)) kept.push(candidate);
  }
  return kept
    .sort((a, b) => a.x - b.x)
    .map((k) => ({
      score: k.score,
      box: { x0: k.x / s, y0: k.y / s, x1: (k.x + tw) / s, y1: (k.y + th) / s },
    }));
}

/**
 * Turns the x positions where the pattern was found into one position per spine: a spine whose pattern was
 * not found (bad light, angle) leaves a gap that is a whole number of spines wide, so it is filled.
 */
export function fillSpineGaps(centers: number[]): number[] {
  const sorted = [...centers].sort((a, b) => a - b);
  if (sorted.length < 2) return sorted;
  const gaps = sorted.slice(1).map((c, i) => c - sorted[i]);
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];

  const result = [sorted[0]];
  gaps.forEach((gap, i) => {
    // Neighbouring gaps tell the local spine width (it changes with perspective); the median is the fallback.
    const neighbours = [gaps[i - 1], gaps[i + 1]].filter((g): g is number => g !== undefined && g < gap * 1.4);
    const reference = neighbours.length > 0 ? Math.min(...neighbours) : median;
    const count = Math.max(1, Math.round(gap / reference));
    for (let k = 1; k < count; k += 1) result.push(sorted[i] + (gap * k) / count);
    result.push(sorted[i + 1]);
  });
  return result;
}

/* ------------------------------------------------------------------ title voting */

interface Token {
  spine: number;
  text: string;
  height: number;
}

interface Cluster {
  members: Token[];
  /** Best spelling of the cluster. */
  title: string;
  spines: Set<number>;
  height: number;
  alternatives: string[];
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

function summarise(members: Token[]): Cluster {
  const longest = Math.max(...members.map((m) => normToken(m.text).length));
  const complete = members.filter((m) => normToken(m.text).length >= longest * 0.75);
  // Medoid: the spelling closest to all the others (frequent spellings win).
  const scored = complete.map((m) => ({
    text: m.text,
    score: members.reduce((sum, other) => sum + editSimilarity(m.text, other.text), 0) + normToken(m.text).length * 0.01,
  }));
  scored.sort((a, b) => b.score - a.score);
  const title = scored[0].text;
  const alternatives = [...new Set(scored.map((s) => s.text))].filter((t) => normToken(t) !== normToken(title)).slice(0, 2);
  return {
    members,
    title,
    spines: new Set(members.map((m) => m.spine)),
    height: median(members.map((m) => m.height)),
    alternatives,
  };
}

/** Pools the words read on every spine and clusters the ones that are spellings of the same word. */
export function clusterTitles(tokens: Token[]): Cluster[] {
  const groups: Token[][] = [];
  const ordered = [...tokens].sort((a, b) => normToken(b.text).length - normToken(a.text).length);
  for (const token of ordered) {
    const group = groups.find((members) => {
      const rep = summarise(members).title;
      return editSimilarity(token.text, rep) >= 0.6 || (normToken(token.text).length >= 4 && fragmentSimilarity(token.text, rep) >= 0.74);
    });
    if (group) group.push(token);
    else groups.push([token]);
  }
  return groups.map(summarise);
}

/* ------------------------------------------------------------------ volumes */

/**
 * Volume per column from what OCR read (`reads`, null = unreadable; `confident` marks reads most readings
 * agreed on, all of them by default). Misreads show up as duplicates, holes or numbers outside the series,
 * and are repaired with the consecutive numbering that the confident reads agree on. A confident read that
 * is unique and plausible is kept even if it breaks the numbering: shelves can have real gaps.
 */
export function assignVolumes(reads: Array<number | null>, confident: boolean[] = reads.map(() => true)): Array<number | undefined> {
  const entries = reads.map((v, i) => ({ v, i, sure: confident[i] })).filter((r): r is { v: number; i: number; sure: boolean } => r.v !== null);

  const fit = (pool: typeof entries) => {
    let best: { agreement: number; model: (index: number) => number } | null = null;
    for (const direction of [1, -1]) {
      for (const { v, i } of pool) {
        const offset = v - direction * i;
        const agreement = pool.filter((r) => r.v === offset + direction * r.i).length;
        if (!best || agreement > best.agreement) best = { agreement, model: (index) => offset + direction * index };
      }
    }
    return best;
  };

  const sure = entries.filter((r) => r.sure);
  let fitted = fit(sure);
  let overrideUnsure = true;
  if (!fitted || fitted.agreement < 3) {
    // Not enough confident reads: fall back to all reads, which must then be mostly consistent.
    fitted = fit(entries);
    overrideUnsure = false;
    if (!fitted || fitted.agreement < 2 || fitted.agreement < entries.length / 2) fitted = null;
  }
  const model = fitted?.model ?? null;
  const strong = model !== null && (overrideUnsure || (fitted?.agreement ?? 0) >= entries.length * 0.66);
  // Four or more confident reads on one consecutive numbering outweigh any single read that contradicts it.
  const dominant = model !== null && overrideUnsure && (fitted?.agreement ?? 0) >= 4 && (fitted?.agreement ?? 0) >= sure.length * 0.5;

  const counts = new Map<number, number>();
  entries.forEach(({ v }) => counts.set(v, (counts.get(v) ?? 0) + 1));

  // Reads far outside the numbering of the shelf ("71" for 11) are misreads.
  const slack = Math.ceil(reads.length / 2);
  const plausible = (value: number) => {
    if (!model) return true;
    const ends = [model(0), model(reads.length - 1)];
    return value >= Math.min(...ends) - slack && value <= Math.max(...ends) + slack;
  };

  return reads.map((read, index) => {
    const modelled = model ? model(index) : undefined;
    const usable = modelled !== undefined && modelled >= 1;
    if (read !== null && model && usable && read === modelled) return read;
    const duplicated = read !== null && (counts.get(read) ?? 0) > 1;
    const trusted = read !== null && plausible(read) && !duplicated && !dominant && (confident[index] || !strong);
    if (trusted) return read;
    return usable ? modelled : undefined;
  });
}

/* ------------------------------------------------------------------ the analysis */

interface Column {
  cx: number;
  pitch: number;
  /** Top of the anchor text on this spine. */
  y: number;
  /** Bottom of the anchor text on this spine. */
  bottom: number;
  /** Match quality (0 when the spine position was inferred, not seen). */
  score: number;
}

/**
 * Template matching also fires on unrelated texture. Real spines are evenly spaced: start from the strong
 * matches, then accept a weaker one only where the next spine is expected (one spine width further).
 */
export function keepRegularMatches(found: TemplateMatch[]): TemplateMatch[] {
  let seeds = found.filter((m) => m.score >= 0.55);
  if (seeds.length < 3) seeds = found.filter((m) => m.score >= 0.45);
  if (seeds.length < 3) return seeds;

  const centerOf = (m: TemplateMatch) => (m.box.x0 + m.box.x1) / 2;
  const kept = [...seeds].sort((a, b) => centerOf(a) - centerOf(b));
  const gaps = kept.slice(1).map((m, i) => centerOf(m) - centerOf(kept[i]));
  const regular = median(gaps);

  for (const side of [-1, 1] as const) {
    for (;;) {
      const edge = side === 1 ? kept[kept.length - 1] : kept[0];
      const expected = centerOf(edge) + side * regular;
      const next = found
        .filter((m) => !kept.includes(m) && Math.abs(centerOf(m) - expected) <= 0.25 * regular)
        .sort((a, b) => b.score - a.score)[0];
      if (!next) break;
      if (side === 1) kept.push(next);
      else kept.unshift(next);
    }
  }
  return kept;
}

const GRAY_SIDE = 960;
const MIN_MATCH_SCORE = 0.4;

/** A short, readable and repeated text makes a good anchor: take the most confident words first. */
function anchorCandidates(words: OcrWord[]): OcrWord[] {
  const seen = new Set<string>();
  return words
    .filter((w) => w.confidence >= 55 && letterCount(w.text) >= 4)
    .sort((a, b) => b.confidence - a.confidence)
    .filter((w) => {
      const key = normToken(w.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function findColumns(engine: ShelfEngine, words: OcrWord[]): { columns: Column[]; hint?: string; strong: number } | null {
  const gray = engine.gray(GRAY_SIDE);
  let best: { columns: Column[]; hint?: string; strong: number } | null = null;

  for (const anchor of anchorCandidates(words)) {
    const w = anchor.box.x1 - anchor.box.x0;
    const h = anchor.box.y1 - anchor.box.y0;
    // Include some surroundings (star, "EDITION"...): a bigger template matches less by chance.
    const template: Box = {
      x0: Math.max(0, anchor.box.x0 - 0.35 * w),
      x1: Math.min(engine.width, anchor.box.x1 + 0.35 * w),
      y0: Math.max(0, anchor.box.y0 - 0.8 * h),
      y1: Math.min(engine.height, anchor.box.y1 + 1.6 * h),
    };
    const found = matchTemplate(gray, template, Math.max(30, 2.5 * h), MIN_MATCH_SCORE);
    const matches = keepRegularMatches(found);
    if (matches.length < 3) continue;

    const centers = matches.map((m) => (m.box.x0 + m.box.x1) / 2);
    const filled = fillSpineGaps(centers);
    // The real pattern matches strongly on many spines; look-alikes match weakly on more of them.
    const strong = matches.filter((m) => m.score >= 0.55).length;
    if (best && (strong < best.strong || (strong === best.strong && filled.length >= best.columns.length))) continue;

    const offset = anchor.box.y0 - template.y0;
    const ys = matches.map((m) => m.box.y0 + offset);
    const baseY = median(ys);
    const textHeight = anchor.box.y1 - anchor.box.y0;
    const wordCenterOffset = (anchor.box.x0 + anchor.box.x1) / 2 - (template.x0 + template.x1) / 2;
    const typicalPitch = median(filled.slice(1).map((c, k) => c - filled[k]));
    best = {
      strong,
      hint: editionHint([anchor]),
      columns: filled.map((cx, i) => {
        const left = filled[i - 1];
        const right = filled[i + 1];
        const pitch = Math.min(left === undefined ? Infinity : cx - left, right === undefined ? Infinity : right - cx);
        const observed = matches.findIndex((m) => Math.abs((m.box.x0 + m.box.x1) / 2 - cx) < 1);
        return {
          cx: cx + wordCenterOffset,
          pitch: Number.isFinite(pitch) ? pitch : typicalPitch,
          y: observed >= 0 ? ys[observed] : baseY,
          bottom: (observed >= 0 ? ys[observed] : baseY) + textHeight,
          score: observed >= 0 ? matches[observed].score : 0,
        };
      }),
    };
  }
  return best;
}

const TEXT_READS: OcrOptions[] = [
  { psm: "11", prep: "grey", scale: 4 },
  { psm: "6", prep: "green", scale: 4 },
  { psm: "11", prep: "bin", scale: 4 },
  { psm: "11", prep: "grey", scale: 5 },
  { psm: "11", prep: "bin", scale: 3 },
];
const DIGIT_READS: OcrOptions[] = [
  { psm: "7", prep: "grey", scale: 1.5, digits: true },
  { psm: "7", prep: "green", scale: 1.5, digits: true },
  { psm: "8", prep: "grey", scale: 3, digits: true },
  { psm: "13", prep: "grey", scale: 3, digits: true },
  { psm: "10", prep: "bin", scale: 3, digits: true },
  { psm: "8", prep: "grey", scale: 1.5, digits: true },
];
/** Readings that must agree for a volume number to be used at all, and for it to be trusted over the numbering. */
const MIN_DIGIT_VOTES = 3;
const CONFIDENT_DIGIT_VOTES = Math.ceil(DIGIT_READS.length * 0.8);

const clampBox = (box: Box, engine: ShelfEngine): Box => ({
  x0: Math.max(0, Math.round(box.x0)),
  y0: Math.max(0, Math.round(box.y0)),
  x1: Math.min(engine.width, Math.round(box.x1)),
  y1: Math.min(engine.height, Math.round(box.y1)),
});

/** The volume number read by most of the readings of a column, or null when they disagree. */
function voteNumber(words: OcrWord[]): { value: number; confident: boolean } | null {
  const votes = new Map<number, number>();
  for (const word of words) {
    if (!/^\d{1,3}$/.test(word.text)) continue;
    const value = Number(word.text);
    if (value >= 1) votes.set(value, (votes.get(value) ?? 0) + 1);
  }
  const [value, count] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return value !== null && count >= MIN_DIGIT_VOTES ? { value, confident: count >= CONFIDENT_DIGIT_VOTES } : null;
}

export interface ShelfAnalysis {
  spines: DetectedSpine[];
  /** Spines that were located but could not be attributed to a title. */
  unresolved: number;
  /** What the analysis saw, for diagnostics and tests. */
  debug: { columns: Array<{ cx: number; pitch: number; y: number; bottom: number; score: number }>; reads: Array<number | null>; clusters: string[] };
}

/**
 * `firstPass` are the words of a whole-photo OCR in the right orientation. Returns null when no repeated
 * pattern is found (the caller then falls back to plain line reading).
 */
export async function analyseShelf(
  engine: ShelfEngine,
  firstPass: OcrWord[],
  onProgress?: (done: number, total: number) => void
): Promise<ShelfAnalysis | null> {
  const found = findColumns(engine, firstPass);
  if (!found) return null;
  const { columns, hint } = found;

  const tokens: Token[] = [];
  const reads: Array<number | null> = [];
  const confident: boolean[] = [];
  for (const [index, column] of columns.entries()) {
    onProgress?.(index, columns.length);
    const x0 = column.cx - column.pitch * 0.55;
    const x1 = column.cx + column.pitch * 0.55;
    const textBox = clampBox({ x0, x1, y0: column.y - column.pitch * 0.05, y1: column.y + column.pitch * 1.2 }, engine);
    const digitBox = clampBox({ x0, x1, y0: column.bottom + column.pitch * 0.85, y1: column.bottom + column.pitch * 2.1 }, engine);

    const spineWords: OcrWord[] = [];
    for (const options of TEXT_READS) spineWords.push(...(await engine.ocr(textBox, options)));
    for (const word of spineWords) {
      if (word.confidence >= 20 && letterCount(word.text) >= 4 && !isNoiseToken(word.text)) {
        tokens.push({ spine: index, text: word.text.replace(/[^\p{L}\p{N}'-]/gu, ""), height: word.box.y1 - word.box.y0 });
      }
    }

    const digitWords: OcrWord[] = [];
    for (const options of DIGIT_READS) digitWords.push(...(await engine.ocr(digitBox, options)));
    const vote = voteNumber(digitWords);
    reads.push(vote ? vote.value : null);
    confident.push(vote?.confident ?? false);
  }
  onProgress?.(columns.length, columns.length);

  // Series = clusters seen on several spines with letters as big as the biggest ones (authors are small).
  const minSupport = columns.length >= 3 ? 2 : 1;
  const clusters = clusterTitles(tokens).filter((c) => c.spines.size >= minSupport && c.title.length >= 4);
  const describe = (list: Cluster[]) => list.map((c) => `${c.title} x${c.spines.size} h${Math.round(c.height)} [${[...c.spines].join(",")}]`);
  if (clusters.length === 0) return { spines: [], unresolved: columns.length, debug: { columns, reads, clusters: [] } };
  const score = (c: Cluster) => c.spines.size * c.height;
  clusters.sort((a, b) => score(b) - score(a));
  const top = clusters[0];
  const series = clusters.filter(
    (c) => c === top || (c.height >= 0.55 * top.height && c.spines.size >= Math.max(minSupport, 0.4 * top.spines.size))
  );

  // On a shelf with a single series, a spine without a readable title belongs to it.
  const owner = new Map<number, Cluster>();
  series.forEach((c) => c.spines.forEach((spine) => !owner.has(spine) && owner.set(spine, c)));
  if (series.length === 1 && top.spines.size >= 2) {
    columns.forEach((_, index) => !owner.has(index) && owner.set(index, top));
  }

  const volumes = assignVolumes(reads, confident);
  const spines: DetectedSpine[] = [];
  columns.forEach((_, index) => {
    const cluster = owner.get(index);
    if (!cluster) return;
    spines.push({
      title: cluster.title,
      volume: volumes[index],
      alternatives: cluster.alternatives,
      hint,
      reliable: cluster.spines.size >= 3,
    });
  });
  return { spines, unresolved: columns.length - spines.length, debug: { columns, reads, clusters: describe(clusters) } };
}
