type ApiPayload = {
  message?: string;
  [key: string]: unknown;
};

async function parseJsonResponse<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

function redirectIfUnauthorized(response: Response) {
  if (response.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export async function readApiMessage(response: Response, fallback: string) {
  redirectIfUnauthorized(response);
  const payload = await parseJsonResponse<ApiPayload>(response);
  return typeof payload?.message === "string" && payload.message.trim()
    ? payload.message
    : fallback;
}

export async function readJsonOrThrow<T>(response: Response, fallback: string) {
  const payload = await parseJsonResponse<T & ApiPayload>(response);

  if (!response.ok) {
    redirectIfUnauthorized(response);
    throw new Error(
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : fallback,
    );
  }

  if (payload === null) throw new Error(fallback);
  return payload;
}

export async function fetchDataArray<T>(url: string, fallback: string): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await readJsonOrThrow<{ data?: unknown }>(response, fallback);
  if (!Array.isArray(payload?.data)) throw new Error(fallback);
  return payload.data as T[];
}
