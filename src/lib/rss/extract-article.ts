import { decodeHtmlEntities } from "./parse";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_SIZE = 512_000;
const MIN_USEFUL_CONTENT_LENGTH = 100;

function isSsrfUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (/^169\.254\./.test(hostname)) return true;
  if (/^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  if (/^(::1|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/.test(hostname)) return true;
  return false;
}

function removeElements(html: string, tags: string[]): string {
  let result = html;
  for (const tag of tags) {
    result = result.replace(
      new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      " "
    );
  }
  return result;
}

function extractMainContent(html: string): string {
  let body = html;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];

  body = removeElements(body, [
    "script",
    "style",
    "nav",
    "header",
    "footer",
    "aside",
    "noscript",
    "iframe",
    "form",
    "svg",
    "figure",
    "figcaption",
  ]);

  const articleMatch = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    body = articleMatch[1];
  } else {
    const mainMatch = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) body = mainMatch[1];
  }

  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(body)) !== null) {
    const text = decodeHtmlEntities(
      match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    ).trim();
    if (text.length > 30) {
      paragraphs.push(text);
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs.join("\n\n");
  }

  const plainText = decodeHtmlEntities(
    body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
  ).trim();
  return plainText;
}

export async function extractArticleContent(
  url: string
): Promise<string | null> {
  if (isSsrfUrl(url)) return null;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html, application/xhtml+xml, */*",
        "User-Agent":
          "Mozilla/5.0 (compatible; SunoFlow/1.0; +https://sunoflow.com)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("xml")) {
      return null;
    }

    const html = await response.text();
    if (html.length > MAX_HTML_SIZE) {
      return extractMainContent(html.slice(0, MAX_HTML_SIZE));
    }

    const content = extractMainContent(html);

    if (content.length < MIN_USEFUL_CONTENT_LENGTH) return null;

    return content.slice(0, 5000);
  } catch {
    return null;
  }
}
