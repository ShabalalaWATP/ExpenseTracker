export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(
    { data },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function empty(status = 204): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (
    error instanceof Error &&
    error.message.includes("claim_period_locked")
  ) {
    error = new ApiError(
      409,
      "claim_locked",
      "This claim period is being prepared or is already frozen.",
    );
  }
  if (
    error instanceof Error &&
    error.message.includes("trip_leg_has_receipt_evidence")
  ) {
    error = new ApiError(
      409,
      "trip_leg_has_receipt_evidence",
      "This itinerary stop is linked to receipt evidence. Its country and dates must remain unchanged.",
    );
  }
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "The request could not be completed.",
      },
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError(
      403,
      "origin_forbidden",
      "This change must be made from the private site.",
    );
  }
}

export async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declared = request.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new ApiError(413, "body_too_large", "The request is too large.");
  }
  if (!request.body) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new ApiError(413, "body_too_large", "The request is too large.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type")?.split(";")[0].trim();
  if (contentType !== "application/json") {
    throw new ApiError(
      415,
      "content_type_invalid",
      "Use application/json for this request.",
    );
  }
  const bytes = await readBoundedBody(request, 64 * 1024);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "json_invalid", "The JSON body is invalid.");
  }
}
