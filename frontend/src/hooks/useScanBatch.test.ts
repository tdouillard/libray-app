import { act, renderHook, waitFor } from "@testing-library/react";
import { isSavable, toBooks, useScanBatch } from "./useScanBatch";

const lookupMock = vi.fn();
vi.mock("../services/bookLookup", () => ({ lookupBookReport: (isbn: string) => lookupMock(isbn) }));
vi.mock("../services/scanLogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/scanLogs")>()),
  logScanFailure: vi.fn(),
}));

const ISBN_A = "9782344059487";
const ISBN_B = "9780306406157";

describe("useScanBatch", () => {
  beforeEach(() => {
    localStorage.clear();
    lookupMock.mockReset();
    lookupMock.mockResolvedValue({ result: { title: "Goetz", author: "Fane", cover: "c.jpg" }, trace: [] });
  });

  it("adds a row immediately and fills it from the lookup", async () => {
    const { result } = renderHook(() => useScanBatch([]));

    act(() => {
      expect(result.current.add(ISBN_A, "BD")).toBe("added");
    });
    expect(result.current.main[0]).toMatchObject({ isbn: ISBN_A, kind: "BD", status: "loading" });

    await waitFor(() => expect(result.current.main[0].status).toBe("found"));
    expect(result.current.main[0]).toMatchObject({ title: "Goetz", author: "Fane" });
  });

  it("keeps a row when nothing is found, and rejects invalid or repeated codes", async () => {
    lookupMock.mockResolvedValue({ result: null, trace: [{ name: "Open Library", status: "not-found" }] });
    const { result } = renderHook(() => useScanBatch([]));

    act(() => {
      expect(result.current.add("9782344059480", "Book")).toBe("invalid");
      expect(result.current.add(ISBN_A, "Book")).toBe("added");
      expect(result.current.add(ISBN_A, "Book")).toBe("duplicate");
    });
    await waitFor(() => expect(result.current.main[0].status).toBe("notFound"));
    expect(result.current.main[0]).toMatchObject({ reason: "not-found", trace: [{ name: "Open Library", status: "not-found" }] });
    expect(result.current.main).toHaveLength(1);
    expect(isSavable(result.current.main[0])).toBe(true);
  });

  it("flags books already in the library and excludes them from saving", async () => {
    const { result } = renderHook(() => useScanBatch(["978-2-344-05948-7"]));
    act(() => {
      result.current.add(ISBN_A, "Book");
    });
    await waitFor(() => expect(result.current.main[0].status).toBe("found"));
    expect(result.current.main[0].owned).toBe(true);
    expect(isSavable(result.current.main[0])).toBe(false);
  });

  it("moves books between the lists and restores a removed one in place", async () => {
    const { result } = renderHook(() => useScanBatch([]));
    act(() => {
      result.current.add(ISBN_A, "Book");
      result.current.add(ISBN_B, "Manga");
    });
    await waitFor(() => expect(result.current.main.every((b) => b.status === "found")).toBe(true));

    const [newest, oldest] = result.current.main;
    act(() => result.current.moveToRescan(newest.id));
    expect(result.current.main.map((b) => b.id)).toEqual([oldest.id]);
    expect(result.current.rescan.map((b) => b.id)).toEqual([newest.id]);

    act(() => result.current.moveBack(newest.id));
    expect(result.current.main.map((b) => b.id)).toEqual([newest.id, oldest.id]);

    let undo = () => {};
    act(() => {
      undo = result.current.remove(newest.id);
    });
    expect(result.current.main.map((b) => b.id)).toEqual([oldest.id]);
    act(() => undo());
    expect(result.current.main.map((b) => b.id)).toEqual([newest.id, oldest.id]);
  });

  it("changes the type of one book or of all of them", async () => {
    const { result } = renderHook(() => useScanBatch([]));
    act(() => {
      result.current.add(ISBN_A, "Book");
      result.current.add(ISBN_B, "Book");
    });
    act(() => result.current.setKind(result.current.main[0].id, "Manga"));
    expect(result.current.main.map((b) => b.kind)).toEqual(["Manga", "Book"]);

    act(() => result.current.setAllKinds("BD"));
    expect(result.current.main.map((b) => b.kind)).toEqual(["BD", "BD"]);
    await waitFor(() => expect(result.current.main.every((b) => b.status === "found")).toBe(true));
  });

  it("limits concurrent lookups to 3", async () => {
    let running = 0;
    let peak = 0;
    lookupMock.mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      return { result: { title: "x" }, trace: [] };
    });
    const isbns = ["9782344059487", "9780306406157", "9780140328721", "9780747532699", "9780439023528"];
    const { result } = renderHook(() => useScanBatch([]));
    act(() => {
      isbns.forEach((i) => result.current.add(i, "Book"));
    });
    await waitFor(() => expect(result.current.main.every((b) => b.status === "found")).toBe(true));
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("restores the session after a reload", async () => {
    const first = renderHook(() => useScanBatch([]));
    act(() => {
      first.result.current.add(ISBN_A, "BD");
    });
    await waitFor(() => expect(first.result.current.main[0].status).toBe("found"));
    first.unmount();

    const second = renderHook(() => useScanBatch([]));
    expect(second.result.current.main).toHaveLength(1);
    expect(second.result.current.main[0]).toMatchObject({ isbn: ISBN_A, kind: "BD", title: "Goetz" });
  });

  it("builds library books with the chosen type", () => {
    const [book] = toBooks([
      { id: "1", isbn: ISBN_A, kind: "Manga", status: "notFound", owned: false, confirmed: false },
    ]);
    expect(book).toMatchObject({ kind: "Manga", isbn: ISBN_A, status: "owned", title: `Unknown book (${ISBN_A})` });
  });
});
