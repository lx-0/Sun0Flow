/**
 * Resource registry for the SunoFlow MCP server.
 *
 * Two resource kinds:
 *   - Static  — fixed URI, always available (e.g. sunoflow://stats/credits)
 *   - Template — URI pattern with path params (e.g. sunoflow://songs/{id})
 */

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface StaticResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  fetch: (userId: string) => Promise<ResourceContent>;
}

export interface TemplateResource {
  /** RFC 6570 URI template, e.g. "sunoflow://songs/{id}" */
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
  /** Extract named params from a concrete URI. Returns null if URI doesn't match. */
  match: (uri: string) => Record<string, string> | null;
  resolve: (
    uri: string,
    params: Record<string, string>,
    userId: string
  ) => Promise<ResourceContent>;
}

const staticResources = new Map<string, StaticResource>();
const templateResources: TemplateResource[] = [];

export function registerStaticResource(r: StaticResource): void {
  staticResources.set(r.uri, r);
}

export function registerTemplateResource(r: TemplateResource): void {
  templateResources.push(r);
}

export function getStaticResources(): StaticResource[] {
  return Array.from(staticResources.values());
}

export function getTemplateResources(): TemplateResource[] {
  return [...templateResources];
}

/**
 * Resolve a URI to resource content for the given user.
 * Returns null if no provider matches.
 */
export async function resolveResource(
  uri: string,
  userId: string
): Promise<ResourceContent | null> {
  // Check static resources first
  const static_ = staticResources.get(uri);
  if (static_) return static_.fetch(userId);

  // Try template resources
  for (const tmpl of templateResources) {
    const params = tmpl.match(uri);
    if (params !== null) {
      return tmpl.resolve(uri, params, userId);
    }
  }

  return null;
}

/** Reset all registries — for use in tests only. */
export function _resetResourceRegistry(): void {
  staticResources.clear();
  templateResources.length = 0;
}
