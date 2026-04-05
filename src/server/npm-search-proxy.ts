/**
 * Cached proxy for npm registry search (keywords:pi-package) and README fetch.
 */

const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const NPM_REGISTRY_URL = "https://registry.npmjs.org";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SEARCH_SIZE = 250;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry<any>>();
const readmeCache = new Map<string, CacheEntry<any>>();

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/** Type keywords to match (same logic as pi.dev/packages) */
const TYPE_KEYWORDS: Record<string, string[]> = {
  extension: ["extension", "pi-extension", "extensions"],
  skill: ["skill", "pi-skill", "skills"],
  theme: ["theme", "pi-theme", "themes"],
  prompt: ["prompt", "pi-prompt", "prompts"],
};

function extractTypes(keywords: string[]): string[] {
  const lc = keywords.map((k) => k.toLowerCase());
  const types: string[] = [];
  for (const [type, matchers] of Object.entries(TYPE_KEYWORDS)) {
    if (lc.some((k) => matchers.includes(k))) types.push(type);
  }
  return types;
}

export interface NpmSearchOptions {
  query?: string;
  type?: string;
}

export interface NpmPackageSearchResult {
  name: string;
  description?: string;
  version: string;
  keywords: string[];
  date: string;
  publisher?: { username: string; email?: string };
  links?: { npm?: string; homepage?: string; repository?: string };
  downloads?: { weekly: number; monthly: number };
  types: string[];
}

export interface NpmSearchResult {
  packages: NpmPackageSearchResult[];
  total: number;
}

export async function searchPackages(options: NpmSearchOptions = {}): Promise<NpmSearchResult> {
  const { query = "", type } = options;
  const cacheKey = `${query}::${type ?? ""}`;

  const cached = searchCache.get(cacheKey);
  if (isFresh(cached)) return cached.data;

  // Build search text
  let text = "keywords:pi-package";
  if (query.trim()) text += ` ${query.trim()}`;

  const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(text)}&size=${SEARCH_SIZE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`npm search failed: ${res.status}`);

  const json = await res.json();
  let packages: NpmPackageSearchResult[] = (json.objects ?? []).map((obj: any) => {
    const pkg = obj.package ?? {};
    const keywords = pkg.keywords ?? [];
    return {
      name: pkg.name,
      description: pkg.description,
      version: pkg.version,
      keywords,
      date: pkg.date,
      publisher: pkg.publisher,
      links: pkg.links,
      downloads: obj.downloads,
      types: extractTypes(keywords),
    };
  });

  // Filter by type if requested
  if (type) {
    packages = packages.filter((p) => p.types.includes(type));
  }

  const result: NpmSearchResult = { packages, total: packages.length };

  searchCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

export interface NpmReadmeResult {
  readme: string;
  name: string;
  version: string;
}

export async function fetchReadme(packageName: string): Promise<NpmReadmeResult> {
  const cached = readmeCache.get(packageName);
  if (isFresh(cached)) return cached.data;

  const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) throw new PackageNotFoundError(packageName);
    throw new Error(`npm registry fetch failed: ${res.status}`);
  }

  const json = await res.json();
  const result: NpmReadmeResult = {
    readme: json.readme ?? "",
    name: json.name ?? packageName,
    version: json["dist-tags"]?.latest ?? json.version ?? "unknown",
  };

  readmeCache.set(packageName, { data: result, timestamp: Date.now() });
  return result;
}

export class PackageNotFoundError extends Error {
  constructor(name: string) {
    super(`Package not found: ${name}`);
    this.name = "PackageNotFoundError";
  }
}

/** Clear all caches (for testing). */
export function clearCaches() {
  searchCache.clear();
  readmeCache.clear();
}
