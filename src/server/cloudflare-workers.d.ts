interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: boolean;
    meta: Record<string, unknown>;
  }>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
  httpEtag: string;
  size?: number;
  customMetadata?: Record<string, string>;
}

interface R2Object {
  key: string;
  size: number;
  httpEtag: string;
  customMetadata?: Record<string, string>;
}

interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

interface R2Bucket {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
    include?: Array<"httpMetadata" | "customMetadata">;
  }): Promise<R2Objects>;
  delete(key: string): Promise<void>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
