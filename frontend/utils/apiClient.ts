type ApiPayload = {
  message?: string;
  [key: string]: unknown;
};

async function parseJsonResponse<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

export async function readApiMessage(response: Response, fallback: string) {
  const payload = await parseJsonResponse<ApiPayload>(response);
  return typeof payload?.message === "string" && payload.message.trim()
    ? payload.message
    : fallback;
}

export async function readJsonOrThrow<T>(response: Response, fallback: string) {
  const payload = await parseJsonResponse<T & ApiPayload>(response);

  if (!response.ok) {
    throw new Error(
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : fallback,
    );
  }

  return payload;
}
