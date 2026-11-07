import { useRef, useState } from "react";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { normalizeIsbn } from "../services/isbn";

interface BarcodeScannerModalProps {
  onClose: () => void;
  /** Receives a validated ISBN-13 (digits only). The parent is responsible for closing the modal. */
  onIsbn: (isbn: string) => void;
}

export function BarcodeScannerModal({ onClose, onIsbn }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualIsbn, setManualIsbn] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [isDecodingFile, setIsDecodingFile] = useState(false);

  const scanner = useBarcodeScanner({ videoRef, active: true, onIsbn });

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsDecodingFile(true);
    setLocalMessage("");
    try {
      const isbn = await scanner.decodeImageFile(file);
      if (isbn) {
        onIsbn(isbn);
      } else {
        setLocalMessage("No ISBN barcode found in this photo. Retake it closer and sharper, or type the ISBN below.");
      }
    } catch (error) {
      console.error(error);
      setLocalMessage("This image could not be read. Try another photo or type the ISBN below.");
    } finally {
      setIsDecodingFile(false);
    }
  };

  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const isbn = normalizeIsbn(manualIsbn);
    if (!isbn) {
      setLocalMessage("This is not a valid ISBN (check the digits printed under the barcode).");
      return;
    }
    onIsbn(isbn);
  };

  const message = localMessage || scanner.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Barcode scan</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Scan a book ISBN</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
            <video ref={videoRef} className="h-72 w-full object-cover" playsInline muted autoPlay />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/70" />
            {scanner.isStarting && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera...</p>
            )}
          </div>

          {message ? (
            <p className="mt-4 text-sm text-red-600">{message}</p>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              {scanner.hint ||
                "Point the camera at the barcode on the back of the book (the one starting with 978 or 979)."}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setLocalMessage("");
                scanner.restart();
              }}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              Re-scan
            </button>
            {scanner.torchAvailable && (
              <button
                type="button"
                onClick={() => void scanner.toggleTorch()}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {scanner.torchOn ? "Light off" : "Light on"}
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isDecodingFile}
              className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isDecodingFile ? "Reading..." : "Use a photo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => void handleFile(event)}
              data-testid="scanner-file-input"
            />
          </div>

          <form className="mt-5 flex gap-2 border-t border-slate-100 pt-4" onSubmit={handleManualSubmit}>
            <input
              value={manualIsbn}
              onChange={(event) => setManualIsbn(event.target.value)}
              inputMode="numeric"
              placeholder="Or type the ISBN: 978 2 344 05948 7"
              aria-label="ISBN typed manually"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Find
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
