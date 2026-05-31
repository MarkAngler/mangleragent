export async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(p: string) => api<T>(p);
export const post = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
export const put = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
export const del = <T>(p: string) => api<T>(p, { method: "DELETE" });
