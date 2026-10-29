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
  console.error(
    "Date Atlas request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    { error: "We couldn't complete that request. Please try again." },
    { status: 503 },
  );
}
