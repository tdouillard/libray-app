import { describe, expect, it } from "vitest";
import {
  assignVolumes,
  clusterTitles,
  editSimilarity,
  fillSpineGaps,
  fragmentSimilarity,
  isNoiseToken,
  matchTemplate,
  parseSpineLine,
  prepareGray,
} from "./shelfAnalysis";

describe("parseSpineLine", () => {
  it("splits a trailing volume number", () => {
    expect(parseSpineLine("Dragon Ball 12")).toEqual({ title: "Dragon Ball", volume: 12 });
    expect(parseSpineLine("One Piece - Tome 7")).toEqual({ title: "One Piece", volume: 7 });
  });
  it("keeps a plain title and drops OCR noise", () => {
    expect(parseSpineLine("Les Misérables")).toEqual({ title: "Les Misérables" });
    expect(parseSpineLine("| ~ 1 l")).toBeNull();
  });
});

describe("text similarity", () => {
  it("tolerates OCR misspellings", () => {
    expect(editSimilarity("Vagabord", "Vagabond")).toBeGreaterThan(0.8);
    expect(editSimilarity("Naruto", "Vagabond")).toBeLessThan(0.3);
  });
  it("recognises a fragment of a word", () => {
    expect(fragmentSimilarity("bord", "Vagabond")).toBeGreaterThanOrEqual(0.74);
    expect(fragmentSimilarity("again", "Vagabond")).toBeLessThan(0.74);
  });
  it("flags publishers and short junk as noise", () => {
    expect(isNoiseToken("VIZBIG")).toBe(true);
    expect(isNoiseToken("1zbig")).toBe(true);
    expect(isNoiseToken("abc")).toBe(true);
    expect(isNoiseToken("Vagabond")).toBe(false);
  });
});

describe("clusterTitles", () => {
  it("votes a title out of misreadings spread over spines", () => {
    const read = (spine: number, text: string) => ({ spine, text, height: 60 });
    const [cluster, ...others] = clusterTitles([
      read(0, "Vagabond"), read(1, "Vagabord"), read(2, "agabod"), read(3, "Vagabond"), read(4, "bord"), read(5, "galbond"),
    ]);
    expect(others).toHaveLength(0);
    expect(cluster.title).toBe("Vagabond");
    expect(cluster.spines.size).toBe(6);
  });
});

describe("fillSpineGaps", () => {
  it("fills a missing spine using the local spine width", () => {
    const filled = fillSpineGaps([144, 492, 650, 786, 914]);
    expect(filled).toHaveLength(6);
    expect(Math.round(filled[1])).toBe(318);
  });
  it("leaves regular positions alone", () => {
    expect(fillSpineGaps([100, 200, 300])).toEqual([100, 200, 300]);
  });
});

describe("assignVolumes", () => {
  it("keeps consistent reads", () => {
    expect(assignVolumes([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });
  it("fills unreadable spines and repairs duplicated misreads with the consecutive numbering", () => {
    // spine 9 really is 9 (read "4", a duplicate of spine 4), spine 11 really is 11 (read "1"), spine 12 unreadable
    const reads = [1, null, 3, 4, 5, null, 7, 8, 4, 10, 1, null];
    expect(assignVolumes(reads)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("overrides reads that contradict the numbering most reads agree on", () => {
    // left-most spines misread as 3 and 2 (really 1 and 3)
    const sure = [false, false, false, true, true, false, true, true, false, false, false, false];
    expect(assignVolumes([3, null, 2, 4, 5, null, 7, 8, null, null, null, null], sure)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("repairs a confident misread that duplicates another volume", () => {
    // spine 12 confidently misread as 4
    const reads = [null, null, null, 4, 5, 6, 7, 8, null, null, null, 4];
    const sure = reads.map((r) => r !== null);
    expect(assignVolumes(reads, sure)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("keeps a real gap in the series", () => {
    expect(assignVolumes([1, 2, 3, 5, 6])).toEqual([1, 2, 3, 5, 6]);
  });
  it("leaves volumes unknown when nothing was read", () => {
    expect(assignVolumes([null, null])).toEqual([undefined, undefined]);
  });
});

describe("matchTemplate", () => {
  it("finds every copy of a pattern in a band", () => {
    const width = 200;
    const height = 40;
    const data = new Uint8ClampedArray(width * height).fill(200);
    const stamp = (x: number) => {
      for (let y = 10; y < 22; y += 1) for (let i = 0; i < 20; i += 1) data[y * width + x + i] = (i + y) % 3 === 0 ? 20 : 230;
    };
    [10, 70, 130].forEach(stamp);
    const matches = matchTemplate({ width, height, scale: 1, data }, { x0: 10, y0: 10, x1: 30, y1: 22 }, 5, 0.8);
    expect(matches.map((m) => Math.round(m.box.x0))).toEqual([10, 70, 130]);
  });
});

describe("prepareGray", () => {
  it("stretches the contrast", () => {
    const rgba = [100, 100, 100, 255, 120, 120, 120, 255, 140, 140, 140, 255];
    const out = prepareGray(rgba, 3, 4, "grey");
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(255);
  });
});
