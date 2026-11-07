import { buildBookFormFromMetadata, cleanBnfCreator, lookupBookByIsbn } from "./bookLookup";

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

function mockProviders(handlers: { google?: unknown; openLibrary?: unknown; bnf?: string; failGoogle?: boolean }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("googleapis.com")) {
      return handlers.failGoogle
        ? new Response("quota", { status: 429 })
        : new Response(JSON.stringify(handlers.google ?? {}), { status: 200 });
    }
    if (url.includes("openlibrary.org")) {
      return new Response(JSON.stringify(handlers.openLibrary ?? {}), { status: 200 });
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

  it("falls back to the BnF when Google Books is rate limited and Open Library is empty", async () => {
    mockProviders({ failGoogle: true, openLibrary: {}, bnf: BNF_XML });

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

  it("merges providers, preferring Google Books and filling gaps from the others", async () => {
    const fetchMock = mockProviders({
      google: {
        items: [
          {
            volumeInfo: {
              title: "Goetz",
              authors: ["Fane", "Didier Cassegrain"],
              description: "Un futur proche...",
              publishedDate: "2026-04-29",
              imageLinks: { thumbnail: "http://books.google.com/cover?id=1&zoom=1&edge=curl" },
            },
          },
        ],
      },
      openLibrary: { "ISBN:9782344059487": { title: "Goetz (OL)", publishers: [{ name: "Glénat" }] } },
      bnf: BNF_XML,
    });

    const result = await lookupBookByIsbn("9782344059487");

    expect(result).toMatchObject({
      title: "Goetz",
      author: "Fane, Didier Cassegrain",
      description: "Un futur proche...",
      year: 2026,
      publisher: "Glénat",
      cover: "https://books.google.com/cover?id=1&zoom=2",
      sources: ["Google Books", "Open Library", "BnF"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("isbn:9782344059487");
  });

  it("returns null when no provider knows the book", async () => {
    mockProviders({ openLibrary: {}, bnf: "<r/>" });
    expect(await lookupBookByIsbn("9782344059487")).toBeNull();
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
