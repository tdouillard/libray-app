import { photoToCanvas, type Rotation } from "./image";
import type { DetectedSpine } from "./shelfSearch";

/**
 * Shelf photo reader, Tesseract.js flavour: free, runs entirely in the browser (the photo never leaves
 * the device). Spines are read sideways, so the photo is OCR'd rotated both ways; every readable line
 * becomes a candidate title that the catalogue search then confirms or discards.
 */

const MAX_SIDE = 2400;
const ROTATIONS: Rotation[] = [90, 270];
const MIN_LETTERS = 4;

/** "Dragon Ball 12" -> { title: "Dragon Ball", volume: 12 } */
export function parseSpineLine(raw: string): DetectedSpine | null {
  const cleaned = raw.replace(/[|_~=\\/<>[\]{}*^]+/g, " ").replace(/\s+/g, " ").trim();
  const letters = (cleaned.match(/\p{L}/gu) ?? []).length;
  // OCR noise is mostly symbols and single characters: keep lines that are mostly letters.
  if (letters < MIN_LETTERS || letters / cleaned.replace(/\s/g, "").length < 0.7) return null;

  const withVolume = cleaned.match(/^(.*?\p{L}.*?)[\s,.:-]+(?:(?:tome|t|vol(?:ume)?|#)\.?\s*)?(\d{1,3})$/iu);
  if (withVolume) return { title: withVolume[1].trim(), volume: Number(withVolume[2]) };
  return { title: cleaned };
}

export async function readShelf(file: Blob): Promise<DetectedSpine[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  // Language data is downloaded on first use, then cached by the browser.
  const worker = await createWorker(["fra", "eng"]);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

    const seen = new Set<string>();
    const spines: DetectedSpine[] = [];
    for (const rotation of ROTATIONS) {
      const canvas = await photoToCanvas(file, MAX_SIDE, rotation);
      const { data } = await worker.recognize(canvas);
      for (const line of data.text.split("\n")) {
        const spine = parseSpineLine(line);
        const key = spine && `${spine.title.toLowerCase()}|${spine.volume ?? ""}`;
        if (!spine || !key || seen.has(key)) continue;
        seen.add(key);
        spines.push(spine);
      }
    }
    return spines;
  } finally {
    await worker.terminate();
  }
}
