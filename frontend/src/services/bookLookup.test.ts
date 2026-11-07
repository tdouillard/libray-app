import { buildBookFormFromMetadata, cleanBnfCreator, lookupBookByIsbn, lookupBookReport } from "./bookLookup";

const BNF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
<srw:records><srw:record><srw:recordData>
<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Goetz</dc:title>
<dc:creator>'Fane (1967-....)</dc:creator>
<dc:publisher>Glénat (Grenoble)</dc:publisher>
<dc:date>2026</dc:date>
<dc:description>Collection : Comix Buro</dc:description>
</oai_dc:dc>
</srw:recordData></srw:record></srw:records>
</srw:searchRetrieveResponse>`;

function mockProviders(handlers: { openLibrary?: unknown; bnf?: string; failOpenLibrary?: boolean }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("openlibrary.org")) {
      return handlers.failOpenLibrary
        ? new Response("quota", { status: 429 })
        : new Response(JSON.stringify(handlers.openLibrary ?? {}), { status: 200 });
    }
    if (url.includes("catalogue.bnf.fr")) {
      return new Response(handlers.bnf ?? "<r/>", { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("lookupBookByIsbn", () => {
  beforeEach(() => {
    // jsdom never loads images: simulate "no cover on Open Library" instantly.
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns null without calling the network for an invalid ISBN", async () => {
    const fetchMock = mockProviders({});
    expect(await lookupBookByIsbn("123")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the BnF when Open Library is rate limited", async () => {
    mockProviders({ failOpenLibrary: true, bnf: BNF_XML });

    const result = await lookupBookByIsbn("978-2-344-05948-7");

    expect(result).toMatchObject({
      title: "Goetz",
      author: "Fane",
      year: 2026,
      publisher: "Glénat",
      tags: ["Comix Buro"],
      sources: ["BnF"],
    });
  });

  it("merges providers, preferring Open Library and filling gaps from the BnF", async () => {
    const fetchMock = mockProviders({
      openLibrary: {
        "ISBN:9782344059487": {
          title: "Goetz (OL)",
          authors: [{ name: "Fane" }, { name: "Didier Cassegrain" }],
          cover: { large: "http://covers.openlibrary.org/b/id/1-L.jpg" },
        },
      },
      bnf: BNF_XML,
    });

    const result = await lookupBookByIsbn("9782344059487");

    expect(result).toMatchObject({
      title: "Goetz (OL)",
      author: "Fane, Didier Cassegrain",
      year: 2026,
      publisher: "Glénat",
      cover: "https://covers.openlibrary.org/b/id/1-L.jpg",
      sources: ["Open Library", "BnF"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when no provider knows the book", async () => {
    mockProviders({ openLibrary: {}, bnf: "<r/>" });
    expect(await lookupBookByIsbn("9782344059487")).toBeNull();
  });
});

describe("lookupBookReport", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports found / not found / error per source, including the cover probe", async () => {
    mockProviders({ failOpenLibrary: true, bnf: BNF_XML });

    const { result, trace } = await lookupBookReport("9782344059487");

    expect(result?.title).toBe("Goetz");
    expect(trace).toEqual([
      { name: "Open Library", status: "error" },
      { name: "BnF", status: "found" },
      { name: "Epagine covers", status: "not-found" },
      { name: "Open Library covers", status: "not-found" },
    ]);
  });

  it("still reports the sources queried when nothing is found", async () => {
    mockProviders({ openLibrary: {}, bnf: "<r/>" });

    const { result, trace } = await lookupBookReport("9782344059487");

    expect(result).toBeNull();
    expect(trace).toEqual([
      { name: "Open Library", status: "not-found" },
      { name: "BnF", status: "not-found" },
    ]);
  });
});

describe("cleanBnfCreator", () => {
  it.each([
    ["'Fane (1967-....)", "Fane"],
    ["Goscinny, René (1926-1977). Scénariste", "René Goscinny"],
    ["Uderzo, Albert (1927-2020)", "Albert Uderzo"],
  ])("%s -> %s", (raw, expected) => {
    expect(cleanBnfCreator(raw)).toBe(expected);
  });
});

describe("buildBookFormFromMetadata", () => {
  it("keeps current values when metadata is missing fields", () => {
    const form = buildBookFormFromMetadata({ title: "Goetz" }, { author: "Me", year: 2020, tags: ["x"], cover: "c" });
    expect(form).toMatchObject({ title: "Goetz", author: "Me", year: 2020, tags: ["x"], cover: "c" });
  });
});
