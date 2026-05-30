export function normalizeBasePath(value: string | undefined | null): string {
  if (!value || value === "/") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function withBasePath(basePath: string | undefined | null, path: string): string {
  const base = normalizeBasePath(basePath);
  const cleanPath = path.replace(/^\/+/, "");
  return `${base}/${cleanPath}`;
}

export function getViteBasePath(): string {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  return normalizeBasePath(env?.BASE_URL);
}

export function apiPath(path: string): string {
  return withBasePath(getViteBasePath(), path);
}
