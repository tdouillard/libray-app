import type { Worker } from "tesseract.js";
import {
  analyseShelf,
  orientationScore,
  parseSpineLine,
  prepareGray,
  wordsToLines,
  type Box,
  type GrayImage,
  type OcrOptions,
  type OcrWord,
  type ShelfEngine,
} from "./shelfAnalysis";
import { photoToCanvas, type Rotation } from "./image";
import type { DetectedSpine } from "./shelfSearch";

/**
 * Shelf photo reader, Tesseract.js flavour: free, runs entirely in the browser (the photo never leaves
 * the device). See shelfAnalysis.ts for how the spines are located and voted on.
 */

const MAX_SIDE = 1920;
const ROTATIONS: Rotation[] = [0, 270, 90, 180];

type PageSegMode = Parameters<Worker["setParameters"]>[0]["tessedit_pageseg_mode"];

function createEngine(canvas: HTMLCanvasElement, worker: Worker): ShelfEngine {
  let current = "";
  const setup = async ({ psm, digits }: OcrOptions) => {
    const key = `${psm}|${digits ? "d" : ""}`;
    if (key === current) return;
    await worker.setParameters({
      tessedit_pageseg_mode: psm as PageSegMode,
      tessedit_char_whitelist: digits ? "0123456789" : "",
    });
    current = key;
  };

  return {
    width: canvas.width,
    height: canvas.height,

    gray(maxSide): GrayImage {
      const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
      const small = document.createElement("canvas");
      small.width = Math.round(canvas.width * scale);
      small.height = Math.round(canvas.height * scale);
      const ctx = small.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0, small.width, small.height);
      const { data } = ctx.getImageData(0, 0, small.width, small.height);
      const gray = new Uint8ClampedArray(small.width * small.height);
      for (let i = 0; i < gray.length; i += 1) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      return { width: small.width, height: small.height, scale, data: gray };
    },

    async ocr(box: Box, options: OcrOptions): Promise<OcrWord[]> {
      await setup(options);
      const width = Math.max(1, Math.round((box.x1 - box.x0) * options.scale));
      const height = Math.max(1, Math.round((box.y1 - box.y0) * options.scale));
      const region = document.createElement("canvas");
      region.width = width;
      region.height = height;
      const ctx = region.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const gray = prepareGray(image.data, width * height, 4, options.prep);
      for (let i = 0; i < gray.length; i += 1) image.data.set([gray[i], gray[i], gray[i], 255], i * 4);
      ctx.putImageData(image, 0, 0);

      const { data } = await worker.recognize(region, {}, { blocks: true });
      const words: OcrWord[] = [];
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              words.push({
                text: word.text,
                confidence: word.confidence,
                box: {
                  x0: box.x0 + word.bbox.x0 / options.scale,
                  y0: box.y0 + word.bbox.y0 / options.scale,
                  x1: box.x0 + word.bbox.x1 / options.scale,
                  y1: box.y0 + word.bbox.y1 / options.scale,
                },
              });
            }
          }
        }
      }
      return words;
    },
  };
}

export async function readShelf(file: Blob, onProgress?: (done: number, total: number) => void): Promise<DetectedSpine[]> {
  const { createWorker } = await import("tesseract.js");
  // Language data is downloaded on first use, then cached by the browser.
  const worker = await createWorker(["eng", "fra"]);
  try {
    // Which way up is the text? Read the whole photo in every orientation and keep the most readable one.
    let best: { engine: ShelfEngine; words: OcrWord[]; score: number } | null = null;
    for (const rotation of ROTATIONS) {
      const engine = createEngine(await photoToCanvas(file, MAX_SIDE, rotation), worker);
      const words = await engine.ocr({ x0: 0, y0: 0, x1: engine.width, y1: engine.height }, { psm: "11", prep: "grey", scale: 1 });
      const score = orientationScore(words);
      if (!best || score > best.score) best = { engine, words, score };
    }
    if (!best || best.score === 0) return [];

    const analysis = await analyseShelf(best.engine, best.words, onProgress);
    if (analysis && analysis.spines.length > 0) return analysis.spines;

    // No repeated pattern (a shelf of different books): every readable line is a candidate title.
    const seen = new Set<string>();
    const spines: DetectedSpine[] = [];
    for (const line of wordsToLines(best.words.filter((w) => w.confidence >= 30))) {
      const spine = parseSpineLine(line);
      const key = spine && `${spine.title.toLowerCase()}|${spine.volume ?? ""}`;
      if (!spine || !key || seen.has(key)) continue;
      seen.add(key);
      spines.push(spine);
    }
    return spines;
  } finally {
    await worker.terminate();
  }
}
