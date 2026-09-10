import { QueryClient } from "@tanstack/react-query";

/** The message field every API error carries. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function toError(response: Response): Promise<ApiError> {
  let body: unknown;
  let message = response.statusText;
  try {
    body = await response.json();
    if (body && typeof body === "object" && "message" in body) {
      message = String((body as { message: unknown }).message);
    }
  } catch {
    message = `Request failed (${response.status})`;
  }
  return new ApiError(response.status, message, body);
}

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Fetches a generated report and hands it to the browser as a download. */
export async function download(path: string) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw await toError(response);

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "report.xlsx";

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: ({ queryKey }) => api("GET", queryKey.join("/")),
      staleTime: 15_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
