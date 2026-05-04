import { describe, it, expect } from "vitest";
import {
  extractTagContent,
  extractAllTagContent,
  stripCDATA,
  decodeHtmlEntities,
  stripTags,
  extractAtomLink,
} from "./parse";

describe("stripCDATA", () => {
  it("unwraps CDATA sections", () => {
    expect(stripCDATA("<![CDATA[hello world]]>")).toBe("hello world");
  });

  it("passes through text without CDATA", () => {
    expect(stripCDATA("plain text")).toBe("plain text");
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("&amp; &lt; &gt; &quot;")).toBe('& < > "');
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("&#65; &#x41;")).toBe("A A");
  });
});

describe("stripTags", () => {
  it("removes HTML tags and normalizes whitespace", () => {
    expect(stripTags("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("handles entity-encoded tags", () => {
    expect(stripTags("&lt;p&gt;text&lt;/p&gt;")).toBe("text");
  });
});

describe("extractTagContent", () => {
  it("extracts content from a simple tag", () => {
    expect(extractTagContent("<title>My Title</title>", "title")).toBe("My Title");
  });

  it("handles CDATA inside tags", () => {
    const xml = "<title><![CDATA[Hello]]></title>";
    expect(extractTagContent(xml, "title")).toBe("Hello");
  });

  it("returns empty string for missing tag", () => {
    expect(extractTagContent("<foo>bar</foo>", "missing")).toBe("");
  });

  it("handles namespaced tags like content:encoded", () => {
    const xml = "<content:encoded>Article body</content:encoded>";
    expect(extractTagContent(xml, "content:encoded")).toBe("Article body");
  });
});

describe("extractAllTagContent", () => {
  it("extracts all occurrences of a tag", () => {
    const xml = "<item>first</item><item>second</item>";
    expect(extractAllTagContent(xml, "item")).toEqual(["first", "second"]);
  });
});

describe("extractAtomLink", () => {
  it("extracts href from atom link element", () => {
    const xml = '<link href="https://example.com/post" rel="alternate" />';
    expect(extractAtomLink(xml)).toBe("https://example.com/post");
  });

  it("returns empty string when no link found", () => {
    expect(extractAtomLink("<p>no link here</p>")).toBe("");
  });
});
