import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BooksPage } from "./BooksPage";

const getUserMediaMock = vi.fn();
const lookupBookByIsbnMock = vi.fn();
const buildBookFormFromMetadataMock = vi.fn();
const decodeFromStreamMock = vi.fn();
const decodeFromImageUrlMock = vi.fn();
const resetMock = vi.fn();
const drawImageMock = vi.fn();
const toDataUrlMock = vi.fn(() => "data:image/png;base64,frame");

let decodeCallback:
  | ((result?: { getText: () => string } | null, error?: { name: string } | null) => void)
  | null = null;

vi.mock("../hooks/useLibraryData", () => ({
  useLibraryData: () => ({
    books: [],
    isLoading: false,
    addBook: vi.fn(),
    updateBook: vi.fn(),
    deleteBook: vi.fn(),
  }),
}));

vi.mock("../services/openLibrary", () => ({
  lookupBookByIsbn: (isbn: string) => lookupBookByIsbnMock(isbn),
  buildBookFormFromMetadata: (metadata: unknown, current: unknown) =>
    buildBookFormFromMetadataMock(metadata, current),
}));

vi.mock("@zxing/library", () => ({
  DecodeHintType: {
    TRY_HARDER: "TRY_HARDER",
    POSSIBLE_FORMATS: "POSSIBLE_FORMATS",
  },
  BarcodeFormat: {
    EAN_13: "EAN_13",
    EAN_8: "EAN_8",
    UPC_A: "UPC_A",
    UPC_E: "UPC_E",
    CODE_128: "CODE_128",
    CODE_39: "CODE_39",
    ITF: "ITF",
  },
  BrowserMultiFormatReader: vi.fn(() => ({
    decodeFromStream: decodeFromStreamMock,
    decodeFromImageUrl: decodeFromImageUrlMock,
    reset: resetMock,
  })),
}));

function setupScannerMocks() {
  const track = { stop: vi.fn() };
  const videoTrack = { applyConstraints: vi.fn().mockResolvedValue(undefined) };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [videoTrack],
  };
  getUserMediaMock.mockResolvedValue(stream);
  decodeFromStreamMock.mockImplementation(
    async (
      _deviceId: string | null,
      _video: HTMLVideoElement,
      callback: (result?: { getText: () => string } | null, error?: { name: string } | null) => void
    ) => {
      decodeCallback = callback;
    }
  );
  return { track, videoTrack };
}

function openScannerModal() {
  fireEvent.click(screen.getByRole("button", { name: "+ Add a book" }));
  const scanButton = screen.getByRole("button", { name: "Scan" });
  fireEvent.click(scanButton);
}

describe("BooksPage scanner feature", () => {
  beforeEach(() => {
    vi.useRealTimers();
    decodeCallback = null;
    getUserMediaMock.mockReset();
    lookupBookByIsbnMock.mockReset();
    buildBookFormFromMetadataMock.mockReset();
    decodeFromStreamMock.mockReset();
    decodeFromImageUrlMock.mockReset();
    resetMock.mockReset();
    drawImageMock.mockReset();
    toDataUrlMock.mockReset();
    toDataUrlMock.mockReturnValue("data:image/png;base64,frame");

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ({
        drawImage: drawImageMock,
      })),
    });

    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      configurable: true,
      value: toDataUrlMock,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens scanner popup when scan button is clicked", async () => {
    setupScannerMocks();
    render(<BooksPage />);

    openScannerModal();

    expect(await screen.findByText("Scan a book ISBN")).not.toBeNull();
  });

  it("requests camera permission when scanner starts", async () => {
    setupScannerMocks();
    render(<BooksPage />);

    openScannerModal();

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            facingMode: { ideal: "environment" },
          }),
          audio: false,
        })
      );
    });
  });

  it("fills ISBN and metadata when barcode is found", async () => {
    setupScannerMocks();
    lookupBookByIsbnMock.mockResolvedValue({ title: "Scanned title" });
    buildBookFormFromMetadataMock.mockReturnValue({
      title: "Scanned title",
      author: "Scanned author",
      description: "Scanned description",
      year: 2024,
      tags: ["Scanned"],
    });

    render(<BooksPage />);
    openScannerModal();

    await waitFor(() => expect(decodeCallback).not.toBeNull());

    await act(async () => {
      decodeCallback?.({ getText: () => "9780306406157" }, null);
    });

    await waitFor(() => {
      const isbnInput = screen.getByPlaceholderText("978-...") as HTMLInputElement;
      const titleInput = screen.getByPlaceholderText("The Name of the Wind") as HTMLInputElement;
      const authorInput = screen.getByPlaceholderText("Patrick Rothfuss") as HTMLInputElement;

      expect(isbnInput.value).toBe("9780306406157");
      expect(titleInput.value).toBe("Scanned title");
      expect(authorInput.value).toBe("Scanned author");
    });
  });

  it("shows timeout message when no barcode is detected in time", async () => {
    vi.useFakeTimers();
    setupScannerMocks();
    render(<BooksPage />);

    openScannerModal();

    await act(async () => {
      await Promise.resolve();
    });
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(screen.queryByText("Live scan timed out. Capture a frame or try again.")).not.toBeNull();
  });

  it("restarts scanning when re-scan button is clicked", async () => {
    vi.useFakeTimers();
    setupScannerMocks();
    render(<BooksPage />);

    openScannerModal();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(getUserMediaMock).toHaveBeenCalledTimes(2);
  });

  it("offers a force-focus action while scanning", async () => {
    setupScannerMocks();
    render(<BooksPage />);

    openScannerModal();

    expect(screen.getByRole("button", { name: "Force focus" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Force focus" }));

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    });
  });

  it("shows a clear message when camera permission is denied", async () => {
    getUserMediaMock.mockRejectedValue({ name: "NotAllowedError" });
    render(<BooksPage />);

    openScannerModal();

    expect(
      await screen.findByText("Camera access is blocked. Enable camera permission for this site and try again.")
    ).not.toBeNull();
  });

  it("captures a frame and decodes it as a fallback", async () => {
    vi.useFakeTimers();
    setupScannerMocks();
    lookupBookByIsbnMock.mockResolvedValue({ title: "Captured title" });
    buildBookFormFromMetadataMock.mockReturnValue({
      title: "Captured title",
      author: "Captured author",
      description: "Captured description",
      year: 2025,
      tags: ["Captured"],
    });
    decodeFromImageUrlMock.mockResolvedValue({
      getText: () => "9780140328721",
    });

    render(<BooksPage />);
    openScannerModal();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture frame" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const isbnInput = screen.getByPlaceholderText("978-...") as HTMLInputElement;
    const titleInput = screen.getByPlaceholderText("The Name of the Wind") as HTMLInputElement;

    expect(drawImageMock).toHaveBeenCalled();
    expect(toDataUrlMock).toHaveBeenCalledWith("image/png");
    expect(decodeFromImageUrlMock).toHaveBeenCalledWith("data:image/png;base64,frame");
    expect(isbnInput.value).toBe("9780140328721");
    expect(titleInput.value).toBe("Captured title");
  });
});
