export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 18000)
    throw new RequestError("This request is too large.", 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestError("Please send a valid JSON request.", 400);
  }
}
export function apiError(error: unknown) {
  if (error instanceof RequestError)
    return Response.json({ error: error.message }, { status: error.status });
  const requestId = crypto.randomUUID();
  console.error("Date Atlas request failed", { requestId, category: error instanceof TypeError ? "type_error" : "unexpected_error" });
  return Response.json(
    { error: "We couldn't complete that request. Please try again.", requestId },
    { status: 503 },
  );
}
