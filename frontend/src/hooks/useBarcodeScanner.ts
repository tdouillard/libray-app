import { useCallback, useEffect, useRef, useState } from "react";
import { BarcodeDetector as BarcodeDetectorPonyfill, prepareZXingModule } from "barcode-detector/ponyfill";
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { normalizeIsbn } from "../services/isbn";

const SCAN_INTERVAL_MS = 120;
const HINT_AFTER_MS = 15000;

/** Book barcodes are EAN-13 (ISBN-13). Some publishers also print ISBN-10 as Code128/Code39. */
const BOOK_FORMATS = ["ean_13", "ean_8", "upc_a", "code_128", "code_39"] as const;

type DetectedBarcode = { rawValue: string };
interface Detector {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

let wasmConfigured = false;
function configureWasm() {
  if (wasmConfigured) {
    return;
  }
  wasmConfigured = true;
  // Serve the zxing-cpp WASM from our own bundle instead of a third party CDN.
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? zxingWasmUrl : prefix + path),
    },
    fireImmediately: false,
  });
}

let detectorPromise: Promise<Detector> | null = null;

/** Native BarcodeDetector (Chrome/Android, Safari) when it understands EAN-13, WASM ponyfill otherwise. */
function getDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: typeof BarcodeDetectorPonyfill }).BarcodeDetector;

    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        if (supported.includes("ean_13")) {
          return new Native({ formats: BOOK_FORMATS.filter((format) => supported.includes(format)) }) as Detector;
        }
      } catch (error) {
        console.info("Native BarcodeDetector unusable, falling back to WASM.", error);
      }
    }

    configureWasm();
    return new BarcodeDetectorPonyfill({ formats: [...BOOK_FORMATS] }) as Detector;
  })();

  return detectorPromise;
}

/** Returns the first valid ISBN-13 found among detected barcodes. */
function firstIsbn(barcodes: DetectedBarcode[]): string | null {
  for (const barcode of barcodes) {
    const isbn = normalizeIsbn(barcode.rawValue);
    if (isbn) {
      return isbn;
    }
  }
  return null;
}

export function getCameraErrorMessage(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera access is blocked. Enable camera permission for this site and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera is already in use by another app. Close it and try again.";
  }
  if (name === "SecurityError" || window.isSecureContext === false) {
    return "Camera scanning requires a secure context (https or localhost).";
  }
  return "Camera access was denied or unavailable. Please allow access and try again.";
}

interface UseBarcodeScannerOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Camera runs only while true. */
  active: boolean;
  /** Called once with a validated ISBN-13 (digits only). */
  onIsbn: (isbn: string) => void;
}

export function useBarcodeScanner({ videoRef, active, onIsbn }: UseBarcodeScannerOptions) {
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [restartToken, setRestartToken] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const onIsbnRef = useRef(onIsbn);
  onIsbnRef.current = onIsbn;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchAvailable(false);
    setTorchOn(false);
  }, [videoRef]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let loopTimer: number | undefined;
    let hintTimer: number | undefined;

    const run = async () => {
      if (!window.isSecureContext) {
        setError(
          "Camera scanning needs HTTPS or localhost. Over plain http on your network the browser blocks the camera. Use the photo or manual ISBN options, or see the HTTPS setup."
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Your browser does not support camera scanning.");
        return;
      }

      setError("");
      setHint("");
      setIsStarting(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const [track] = stream.getVideoTracks();
        try {
          // Not typed in lib.dom: continuous autofocus is critical for small, glossy barcodes.
          await track?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
        } catch {
          /* camera without focus control */
        }
        const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchAvailable(Boolean(capabilities.torch));

        const video = videoRef.current;
        if (!video) {
          return;
        }
        video.srcObject = stream;
        await video.play();
        setIsStarting(false);

        hintTimer = window.setTimeout(() => {
          setHint("Still nothing. Hold the barcode flat, 15-25 cm away, with good light and no glare.");
        }, HINT_AFTER_MS);

        const detector = await getDetector();

        const tick = async () => {
          if (cancelled) {
            return;
          }

          if (video.readyState >= 2 && video.videoWidth > 0) {
            try {
              const isbn = firstIsbn(await detector.detect(video));
              if (isbn && !cancelled) {
                cancelled = true;
                onIsbnRef.current(isbn);
                return;
              }
            } catch (detectError) {
              console.info("Barcode detection frame failed", detectError);
            }
          }

          loopTimer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
        };

        void tick();
      } catch (startError) {
        if (!cancelled) {
          console.error(startError);
          setError(getCameraErrorMessage(startError));
          stopStream();
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(loopTimer);
      window.clearTimeout(hintTimer);
      stopStream();
    };
  }, [active, restartToken, stopStream, videoRef]);

  const restart = useCallback(() => setRestartToken((token) => token + 1), []);

  const toggleTorch = useCallback(async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) {
      return;
    }
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch (torchError) {
      console.info("Torch not supported", torchError);
    }
  }, [torchOn]);

  /** Decode a still picture (camera app photo, gallery image). Returns the ISBN-13 or null. */
  const decodeImageFile = useCallback(async (file: File): Promise<string | null> => {
    const detector = await getDetector();
    const bitmap = await createImageBitmap(file);
    try {
      return firstIsbn(await detector.detect(bitmap));
    } finally {
      bitmap.close();
    }
  }, []);

  return { error, setError, hint, isStarting, torchAvailable, torchOn, toggleTorch, restart, decodeImageFile };
}
