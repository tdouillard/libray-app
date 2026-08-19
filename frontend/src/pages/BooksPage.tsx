import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } from "@zxing/library";
import { BookCard } from "../components/BookCard";
import { BookDetailModal } from "../components/BookDetailModal";
import { StatsCard } from "../components/StatsCard";
import { useLibraryData } from "../hooks/useLibraryData";
import { buildBookFormFromMetadata, lookupBookByIsbn } from "../services/openLibrary";
import type { Book, BookStatus } from "../types";

const statusFilters = ["all", "owned", "reading", "borrowed", "wishlist"] as const;
type StatusFilter = (typeof statusFilters)[number];
const SCAN_TIMEOUT_MS = 30000;
const SCAN_INTERVAL_MS = 100;

const scannerHints = new Map();
scannerHints.set(DecodeHintType.TRY_HARDER, true);
scannerHints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
]);

async function configureVideoTrack(stream: MediaStream): Promise<void> {
  const [videoTrack] = stream.getVideoTracks();
  if (!videoTrack) {
    return;
  }

  try {
    const advancedConstraints: MediaTrackConstraintSet = {};
    Object.assign(advancedConstraints, { focusMode: "continuous" });
    await videoTrack.applyConstraints({
      advanced: [advancedConstraints],
    });
  } catch (error) {
    console.info("Continuous focus not supported on this camera.", error);
  }
}

function buildCaptureCanvases(video: HTMLVideoElement): HTMLCanvasElement[] {
  const width = video.videoWidth || video.clientWidth || 1280;
  const height = video.videoHeight || video.clientHeight || 720;

  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = width;
  fullCanvas.height = height;

  const fullContext = fullCanvas.getContext("2d");
  if (!fullContext) {
    return [];
  }

  fullContext.drawImage(video, 0, 0, width, height);

  const centerCanvas = document.createElement("canvas");
  const cropWidth = Math.max(240, Math.round(width * 0.72));
  const cropHeight = Math.max(120, Math.round(height * 0.42));
  const cropX = Math.max(0, Math.round((width - cropWidth) / 2));
  const cropY = Math.max(0, Math.round((height - cropHeight) / 2));

  centerCanvas.width = cropWidth;
  centerCanvas.height = cropHeight;

  const centerContext = centerCanvas.getContext("2d");
  if (!centerContext) {
    return [fullCanvas];
  }

  centerContext.drawImage(fullCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return [fullCanvas, centerCanvas];
}

function getScannerErrorMessage(error: unknown): string {
  const errorName =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof (error as { name: unknown }).name === "string"
      ? (error as { name: string }).name
      : "";

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Camera access is blocked. Enable camera permission for this site and try again.";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "Camera is already in use by another app. Close it and try again.";
  }

  if (errorName === "SecurityError" || !window.isSecureContext) {
    return "Camera scanning requires a secure context (https or localhost).";
  }

  return "Camera access was denied or unavailable. Please allow access and try again.";
}

const initialForm: Omit<Book, "id" | "cover" | "rating" | "collectionIds"> & { cover?: string } = {
  title: "",
  author: "",
  isbn: "",
  year: new Date().getFullYear(),
  status: "owned",
  description: "",
  tags: ["New"],
  cover: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80",
};

export function BooksPage() {
  const { books: bookList, isLoading, addBook, updateBook, deleteBook } = useLibraryData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState(initialForm);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [isCapturingFrame, setIsCapturingFrame] = useState(false);
  const [isLookingUpMetadata, setIsLookingUpMetadata] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);

  const clearScanTimeout = useCallback(() => {
    if (scanTimeoutRef.current !== null) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, []);

  const stopActiveScan = useCallback(() => {
    clearScanTimeout();

    codeReaderRef.current?.reset();
    codeReaderRef.current = null;

    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [clearScanTimeout]);

  const stopScanner = useCallback(() => {
    stopActiveScan();
    setScannerOpen(false);
    setScannerError("");
  }, [stopActiveScan]);

  const handleMetadataLookup = useCallback(async (isbn: string) => {
    const cleanedIsbn = isbn.trim();
    if (!cleanedIsbn) {
      return;
    }

    setIsLookingUpMetadata(true);
    setLookupMessage("Looking up book details...");

    const metadata = await lookupBookByIsbn(cleanedIsbn);

    if (!metadata) {
      setLookupMessage("No metadata found for this barcode yet.");
      setIsLookingUpMetadata(false);
      return;
    }

    setFormValues((current) => ({
      ...current,
      isbn: cleanedIsbn,
      ...buildBookFormFromMetadata(metadata, current),
    }));

    setLookupMessage("Book information imported successfully.");
    setIsLookingUpMetadata(false);
  }, []);

  const handleDetectedBarcode = useCallback(
    (value: string) => {
      const isbn = value.trim();
      if (!isbn) {
        return;
      }

      setFormValues((current) => ({ ...current, isbn }));
      void handleMetadataLookup(isbn);
      stopScanner();
    },
    [handleMetadataLookup, stopScanner]
  );

  const captureFrameAndDecode = useCallback(async () => {
    const activeVideo = videoRef.current;
    if (!activeVideo) {
      setScannerError("The camera preview is not ready yet. Try again in a moment.");
      return;
    }

    setIsCapturingFrame(true);
    setScannerError("");
    const frameReader = new BrowserMultiFormatReader(scannerHints);

    try {
      const canvases = buildCaptureCanvases(activeVideo);
      if (canvases.length === 0) {
        setScannerError("This browser could not capture a frame from the camera.");
        return;
      }

      let decodeError: unknown = null;

      for (const canvas of canvases) {
        try {
          const result = await frameReader.decodeFromImageUrl(canvas.toDataURL("image/png"));
          handleDetectedBarcode(result.getText());
          return;
        } catch (error) {
          decodeError = error;
        }
      }

      throw decodeError ?? new Error("No barcode detected from captured frame.");
    } catch (error) {
      console.error(error);
      setScannerError("Manual capture could not detect a barcode. Move closer, reduce glare, and try again.");
    } finally {
      frameReader.reset();
      setIsCapturingFrame(false);
    }
  }, [handleDetectedBarcode]);

  const startScanner = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Your browser does not support camera scanning.");
      return;
    }

    stopActiveScan();
    setScannerError("");

    const codeReader = new BrowserMultiFormatReader(scannerHints, SCAN_INTERVAL_MS);
    codeReaderRef.current = codeReader;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      await configureVideoTrack(stream);

      const activeVideo = videoRef.current;
      if (!activeVideo) {
        stream.getTracks().forEach((track) => track.stop());
        setScannerOpen(false);
        return;
      }

      activeVideo.srcObject = stream;
      await activeVideo.play();
      scanTimeoutRef.current = window.setTimeout(() => {
        clearScanTimeout();
        setScannerError("Live scan timed out. Capture a frame or try again.");
      }, SCAN_TIMEOUT_MS);

      await codeReader.decodeFromStream(stream, activeVideo, (result, error) => {
        if (result) {
          handleDetectedBarcode(result.getText());
          return;
        }

        if (error && error.name !== "NotFoundException") {
          setScannerError("Unable to read this barcode. Try a clearer angle.");
        }
      });
    } catch (error) {
      console.error(error);
      setScannerError(getScannerErrorMessage(error));
      stopActiveScan();
    }
  }, [clearScanTimeout, handleDetectedBarcode, stopActiveScan, stopScanner]);

  useEffect(() => {
    if (!scannerOpen) {
      return;
    }

    void startScanner();
  }, [scannerOpen, startScanner]);

  useEffect(() => {
    return () => {
      stopActiveScan();
    };
  }, [stopActiveScan]);

  const filteredBooks = useMemo(() => {
    return bookList.filter((book) => {
      const matchesStatus = status === "all" || book.status === status;
      const matchesSearch =
        search.trim().length === 0 ||
        `${book.title} ${book.author} ${book.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [bookList, search, status]);

  const totalBooks = bookList.length;
  const ownedBooks = bookList.filter((book) => book.status === "owned").length;
  const readingBooks = bookList.filter((book) => book.status === "reading").length;
  const wishlistBooks = bookList.filter((book) => book.status === "wishlist").length;

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;

    setFormValues((current) => ({
      ...current,
      [name]: name === "year" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newBook: Book = {
      id: `book-${Date.now()}`,
      title: formValues.title,
      author: formValues.author,
      isbn: formValues.isbn,
      year: formValues.year,
      status: formValues.status as BookStatus,
      description: formValues.description || "A newly added title to your library.",
      tags: formValues.tags.length > 0 ? formValues.tags : ["New"],
      cover: formValues.cover || "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80",
      rating: 4.5,
      collectionIds: [],
    };

    await addBook(newBook);
    setFormValues(initialForm);
    setShowForm(false);
  };

  return (
    <>
      <div className="space-y-8">
        <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Catalogue overview
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Your library at a glance
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {showForm ? "Close form" : "+ Add a book"}
          </button>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard label="Total books" value={String(totalBooks)} detail="items" />
          <StatsCard label="Owned" value={String(ownedBooks)} detail="in stock" />
          <StatsCard label="Reading" value={String(readingBooks)} detail="active" />
          <StatsCard label="Wishlist" value={String(wishlistBooks)} detail="planned" />
        </section>

        {showForm && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-slate-900">Add a new book</h3>
              <span className="text-sm text-slate-500">Quick entry</span>
            </div>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="block text-sm text-slate-700">
                Title
                <input
                  name="title"
                  value={formValues.title}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  placeholder="The Name of the Wind"
                  required
                />
              </label>

              <label className="block text-sm text-slate-700">
                Author
                <input
                  name="author"
                  value={formValues.author}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  placeholder="Patrick Rothfuss"
                  required
                />
              </label>

              <label className="block text-sm text-slate-700">
                ISBN
                <div className="mt-1 flex gap-2">
                  <input
                    name="isbn"
                    value={formValues.isbn}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                    placeholder="978-..."
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMetadataLookup(formValues.isbn)}
                    disabled={isLookingUpMetadata || !formValues.isbn}
                    className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isLookingUpMetadata ? "Loading..." : "Lookup"}
                  </button>
                </div>
                {lookupMessage && (
                  <p className="mt-2 text-xs text-slate-500">{lookupMessage}</p>
                )}
              </label>

              <label className="block text-sm text-slate-700">
                Year
                <input
                  name="year"
                  type="number"
                  value={formValues.year}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  required
                />
              </label>

              <label className="block text-sm text-slate-700 md:col-span-2">
                Description
                <textarea
                  name="description"
                  value={formValues.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  placeholder="Short description or notes..."
                />
              </label>

              <label className="block text-sm text-slate-700">
                Status
                <select
                  name="status"
                  value={formValues.status}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                >
                  <option value="owned">Owned</option>
                  <option value="reading">Reading</option>
                  <option value="borrowed">Borrowed</option>
                  <option value="wishlist">Wishlist</option>
                </select>
              </label>

              <div className="flex items-end justify-end gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Save book
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Book list
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Browse your collection</h3>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title, author or tag"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
              />

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
              >
                {statusFilters.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All statuses" : option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6">
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                Loading library data…
              </div>
            ) : filteredBooks.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredBooks.map((book) => (
                  <BookCard key={book.id} book={book} onSelectBook={setSelectedBook} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                No books match your current filters.
              </div>
            )}
          </div>
        </section>
      </div>

      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                  Barcode scan
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Scan a book ISBN</h3>
              </div>
              <button
                type="button"
                onClick={stopScanner}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <video ref={videoRef} className="h-72 w-full object-cover" playsInline muted autoPlay />
              </div>

              {scannerError ? (
                <p className="mt-4 text-sm text-red-600">{scannerError}</p>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  Point the camera at the barcode on the back of the book. If live scanning misses it, capture a frame and decode it manually.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void startScanner()}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  Re-scan
                </button>
                <button
                  type="button"
                  onClick={() => void startScanner()}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Force focus
                </button>
                <button
                  type="button"
                  onClick={() => void captureFrameAndDecode()}
                  disabled={isCapturingFrame}
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCapturingFrame ? "Capturing..." : "Capture frame"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BookDetailModal
        book={selectedBook}
        onClose={() => setSelectedBook(null)}
        onStatusChange={async (bookId, status) => {
          await updateBook(bookId, { status });
          setSelectedBook((current) => (current ? { ...current, status } : current));
        }}
        onDelete={async (bookId) => {
          await deleteBook(bookId);
          setSelectedBook(null);
        }}
      />
    </>
  );
}
