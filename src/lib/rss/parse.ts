export function extractTagContent(xml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(":", ":");
  const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i");
  const match = xml.match(regex);
  return match ? stripCDATA(match[1].trim()) : "";
}

export function extractAllTagContent(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

export function stripCDATA(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

export function stripTags(text: string): string {
  const strip = (s: string) =>
    decodeHtmlEntities(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return strip(strip(text));
}

export function extractAtomLink(itemXml: string): string {
  const match = itemXml.match(
    /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i
  );
  return match ? match[1] : "";
}
