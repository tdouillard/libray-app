import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BooksPage } from "./BooksPage";

const getUserMediaMock = vi.fn();
const lookupBookByIsbnMock = vi.fn();
const detectMock = vi.fn();

vi.mock("../hooks/useLibraryData", () => ({
  useLibraryData: () => ({
    books: [],
    collections: [],
    isLoading: false,
    addBook: vi.fn(),
    updateBook: vi.fn(),
    deleteBook: vi.fn(),
  }),
}));

vi.mock("../services/bookLookup", () => ({
  lookupBookByIsbn: (isbn: string) => lookupBookByIsbnMock(isbn),
  buildBookFormFromMetadata: (metadata: Record<string, unknown>, current: Record<string, unknown>) => ({
    ...current,
    ...metadata,
  }),
}));

vi.mock("barcode-detector/ponyfill", () => ({
  prepareZXingModule: vi.fn(),
  BarcodeDetector: class {
    detect = detectMock;
  },
}));

vi.mock("zxing-wasm/reader/zxing_reader.wasm?url", () => ({ default: "/zxing_reader.wasm" }));

function setupCamera() {
  const track = {
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    getCapabilities: () => ({}),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  getUserMediaMock.mockResolvedValue(stream);
  return { track };
}

function openScannerModal() {
  fireEvent.click(screen.getByRole("button", { name: "+ Add a book" }));
  fireEvent.click(screen.getByRole("button", { name: "Scan" }));
}

describe("BooksPage barcode scanner", () => {
  beforeEach(() => {
    getUserMediaMock.mockReset();
    lookupBookByIsbnMock.mockReset();
    detectMock.mockReset();
    detectMock.mockResolvedValue([]);

    // jsdom is not a secure context by default; pretend we are on https/localhost.
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });
    // jsdom never loads video data: pretend a frame is available.
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => 4 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
  });

  it("opens the scanner popup and asks for the rear camera", async () => {
    setupCamera();
    render(<BooksPage />);

    openScannerModal();

    expect(await screen.findByText("Scan a book ISBN")).not.toBeNull();
    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: { ideal: "environment" } }),
          audio: false,
        })
      );
    });
  });

  it("fills ISBN and metadata when a book barcode is detected", async () => {
    setupCamera();
    detectMock.mockResolvedValue([{ rawValue: "9782344059487", format: "ean_13" }]);
    lookupBookByIsbnMock.mockResolvedValue({
      title: "Goetz",
      author: "Fane, Didier Cassegrain",
      sources: ["BnF"],
    });

    render(<BooksPage />);
    openScannerModal();

    await waitFor(() => {
      expect((screen.getByPlaceholderText("978-...") as HTMLInputElement).value).toBe("9782344059487");
      expect((screen.getByPlaceholderText("The Name of the Wind") as HTMLInputElement).value).toBe("Goetz");
      expect((screen.getByPlaceholderText("Patrick Rothfuss") as HTMLInputElement).value).toBe(
        "Fane, Didier Cassegrain"
      );
    });

    expect(lookupBookByIsbnMock).toHaveBeenCalledWith("9782344059487");
    expect(screen.queryByText("Scan a book ISBN")).toBeNull();
  });

  it("ignores barcodes that are not valid ISBNs and keeps scanning", async () => {
    setupCamera();
    detectMock
      .mockResolvedValueOnce([{ rawValue: "5901234123457", format: "ean_13" }]) // valid EAN, but not a book
      .mockResolvedValueOnce([{ rawValue: "9782344059480", format: "ean_13" }]) // bad checksum
      .mockResolvedValue([{ rawValue: "9782344059487", format: "ean_13" }]);
    lookupBookByIsbnMock.mockResolvedValue({ title: "Goetz" });

    render(<BooksPage />);
    openScannerModal();

    await waitFor(
      () => expect((screen.getByPlaceholderText("978-...") as HTMLInputElement).value).toBe("9782344059487"),
      { timeout: 3000 }
    );
    expect(lookupBookByIsbnMock).toHaveBeenCalledTimes(1);
  });

  it("shows a clear message when camera permission is denied", async () => {
    getUserMediaMock.mockRejectedValue({ name: "NotAllowedError" });
    render(<BooksPage />);

    openScannerModal();

    expect(
      await screen.findByText("Camera access is blocked. Enable camera permission for this site and try again.")
    ).not.toBeNull();
  });

  it("lets the user type an ISBN when scanning is not possible", async () => {
    getUserMediaMock.mockRejectedValue({ name: "NotFoundError" });
    lookupBookByIsbnMock.mockResolvedValue({ title: "Goetz" });
    render(<BooksPage />);
    openScannerModal();

    const manualInput = await screen.findByLabelText("ISBN typed manually");

    fireEvent.change(manualInput, { target: { value: "978 2 344 05948 0" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(screen.getByText(/not a valid ISBN/)).not.toBeNull();
    expect(lookupBookByIsbnMock).not.toHaveBeenCalled();

    fireEvent.change(manualInput, { target: { value: "978-2-344-05948-7" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    await waitFor(() => expect(lookupBookByIsbnMock).toHaveBeenCalledWith("9782344059487"));
  });

  it("decodes a photo chosen from the camera or gallery", async () => {
    setupCamera();
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close }));
    lookupBookByIsbnMock.mockResolvedValue({ title: "Goetz" });

    render(<BooksPage />);
    openScannerModal();

    // Live video frames find nothing; only the uploaded photo contains the barcode.
    detectMock.mockImplementation(async (source: unknown) =>
      source instanceof HTMLVideoElement ? [] : [{ rawValue: "9782344059487", format: "ean_13" }]
    );
    const input = await screen.findByTestId("scanner-file-input");
    fireEvent.change(input, { target: { files: [new File(["x"], "barcode.jpg", { type: "image/jpeg" })] } });

    await waitFor(() => expect(lookupBookByIsbnMock).toHaveBeenCalledWith("9782344059487"));
    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
