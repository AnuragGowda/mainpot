/**
 * PostgREST <=16.2 can briefly use a stale clock and reject a valid JWT with
 * PGRST303 / "JWT issued at future". An auth rejection cannot execute the
 * query, so retry that exact request once; never replay an unknown outcome.
 * Upstream fix: https://github.com/PostgREST/postgrest/issues/5196
 */
export const fetchWithFutureJwtRetry: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const isDataRequest = /\/rest\/v1(?:\/|\?|$)/.test(url);
  const replayInput = isDataRequest && input instanceof Request ? input.clone() : input;
  const response = await fetch(input, init);
  if (!isDataRequest || response.status !== 401) return response;
  const error = await response.clone().json().catch(() => null) as { code?: string; message?: string } | null;
  if (error?.code !== "PGRST303" || error.message !== "JWT issued at future") return response;

  const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
  await new Promise<void>((resolve, reject) => {
    const cleanUp = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); };
    const onAbort = () => { cleanUp(); reject(new DOMException("The request was aborted", "AbortError")); };
    const timer = setTimeout(() => { cleanUp(); resolve(); }, 1_000);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
  return fetch(replayInput, init);
};
