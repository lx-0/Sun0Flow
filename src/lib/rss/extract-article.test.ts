import { describe, it, expect, vi, beforeEach } from "vitest";
import { isSsrfUrl, extractArticleContent } from "./extract-article";

describe("isSsrfUrl", () => {
  it("blocks localhost", () => {
    expect(isSsrfUrl("http://localhost/foo")).toBe(true);
  });

  it("blocks 127.0.0.1", () => {
    expect(isSsrfUrl("http://127.0.0.1/secret")).toBe(true);
  });

  it("blocks 0.0.0.0", () => {
    expect(isSsrfUrl("http://0.0.0.0/")).toBe(true);
  });

  it("blocks 10.x private range", () => {
    expect(isSsrfUrl("http://10.0.0.1/")).toBe(true);
  });

  it("blocks 172.16-31.x private range", () => {
    expect(isSsrfUrl("http://172.16.0.1/")).toBe(true);
    expect(isSsrfUrl("http://172.31.255.255/")).toBe(true);
  });

  it("blocks 192.168.x private range", () => {
    expect(isSsrfUrl("http://192.168.1.1/")).toBe(true);
  });

  it("blocks link-local 169.254.x", () => {
    expect(isSsrfUrl("http://169.254.169.254/latest/meta-data")).toBe(true);
  });

  it("blocks non-http protocols", () => {
    expect(isSsrfUrl("ftp://example.com/file")).toBe(true);
    expect(isSsrfUrl("file:///etc/passwd")).toBe(true);
  });

  it("blocks invalid URLs", () => {
    expect(isSsrfUrl("not-a-url")).toBe(true);
  });

  it("allows valid public URLs", () => {
    expect(isSsrfUrl("https://example.com/article")).toBe(false);
    expect(isSsrfUrl("http://blog.example.org/post/123")).toBe(false);
  });

  it("allows 172.x outside private range", () => {
    expect(isSsrfUrl("http://172.15.0.1/")).toBe(false);
    expect(isSsrfUrl("http://172.32.0.1/")).toBe(false);
  });

  it("blocks ::1 (IPv6 loopback)", () => {
    expect(isSsrfUrl("http://[::1]/")).toBe(true);
  });

  it("blocks IPv6-mapped private IPs", () => {
    expect(isSsrfUrl("http://[::ffff:127.0.0.1]/")).toBe(true);
    expect(isSsrfUrl("http://[::ffff:10.0.0.1]/")).toBe(true);
    expect(isSsrfUrl("http://[::ffff:192.168.1.1]/")).toBe(true);
  });

  it("allows IPv6-mapped public IPs", () => {
    expect(isSsrfUrl("http://[::ffff:8.8.8.8]/")).toBe(false);
  });

  it("blocks IPv6 unique local addresses", () => {
    expect(isSsrfUrl("http://[fc00::1]/")).toBe(true);
    expect(isSsrfUrl("http://[fd12::1]/")).toBe(true);
  });
});

function mockFetchResponse(body: string, options?: { contentType?: string; status?: number; headers?: Record<string, string> }) {
  const contentType = options?.contentType ?? "text/html; charset=utf-8";
  const status = options?.status ?? 200;
  const headers = new Headers({ "content-type": contentType, ...(options?.headers ?? {}) });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => body,
  } as Response;
}

describe("extractArticleContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts content from <article> tag", async () => {
    const html = `<html><body><nav>nav</nav><article><p>${"A".repeat(120)}</p></article></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(html)));

    const result = await extractArticleContent("https://example.com/post");
    expect(result).toContain("A".repeat(120));
  });

  it("falls back to <main> when no <article>", async () => {
    const content = "B".repeat(120);
    const html = `<html><body><main><p>${content}</p></main></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(html)));

    const result = await extractArticleContent("https://example.com/post");
    expect(result).toContain(content);
  });

  it("falls back to <p> extraction when no <article> or <main>", async () => {
    const content = "C".repeat(120);
    const html = `<html><body><div><p>${content}</p></div></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(html)));

    const result = await extractArticleContent("https://example.com/post");
    expect(result).toContain(content);
  });

  it("returns null for SSRF-blocked URL without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractArticleContent("http://169.254.169.254/latest");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for non-HTML content-type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse("{}", { contentType: "application/json" })
    ));

    const result = await extractArticleContent("https://example.com/api");
    expect(result).toBeNull();
  });

  it("returns null when content is shorter than MIN_USEFUL_CONTENT_LENGTH", async () => {
    const html = `<html><body><p>Too short</p></body></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(html)));

    const result = await extractArticleContent("https://example.com/stub");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const result = await extractArticleContent("https://example.com/slow");
    expect(result).toBeNull();
  });

  it("returns null when redirect targets a private IP (SSRF bypass)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetchResponse("", {
        status: 301,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractArticleContent("https://evil.com/redirect");
    expect(result).toBeNull();
  });

  it("follows safe redirects", async () => {
    const articleBody = "D".repeat(150);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetchResponse("", {
        status: 302,
        headers: { location: "https://example.com/final" },
      }))
      .mockResolvedValueOnce(mockFetchResponse(
        `<html><body><article><p>${articleBody}</p></article></body></html>`
      ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractArticleContent("https://example.com/redirect");
    expect(result).toContain(articleBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses redirect: manual, not follow", async () => {
    const html = `<html><body><article><p>${"E".repeat(150)}</p></article></body></html>`;
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(html));
    vi.stubGlobal("fetch", fetchMock);

    await extractArticleContent("https://example.com/post");
    expect(fetchMock.mock.calls[0][1]).toHaveProperty("redirect", "manual");
  });

  it("returns null when response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse("Not Found", { status: 404, contentType: "text/html" })
    ));

    const result = await extractArticleContent("https://example.com/missing");
    expect(result).toBeNull();
  });
});
