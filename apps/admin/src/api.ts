export type Tokens = { accessToken: string; refreshToken: string };
export type UserProfile = {
  id: string;
  username: string;
  discord: string;
  admin: boolean;
};
export type AdminComment = {
  id: string;
  productId: string;
  content: string;
  score: number;
  language?: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  upvotes: number;
  downvotes: number;
  user: { id: string; username: string };
};
export type AdminCommentsPage = { count: number; comments: AdminComment[] };
export type ImportResult = { imported: number; skipped: number; errors: string[] };
export type Environment = "prod" | "dev";

const CONFIGURED_API_ORIGIN =
  (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "";
const ENVIRONMENT_KEY = "booth-plus-admin-environment";
const OAUTH_STATE_KEY = "booth-plus-admin-oauth-state";

export const getSelectedEnvironment = (): Environment =>
  localStorage.getItem(ENVIRONMENT_KEY) === "dev" ? "dev" : "prod";

export const setSelectedEnvironment = (environment: Environment) =>
  localStorage.setItem(ENVIRONMENT_KEY, environment);

const apiOrigin = () => CONFIGURED_API_ORIGIN || `/api-target/${getSelectedEnvironment()}`;
const tokenKey = () => `booth-plus-admin-tokens:${getSelectedEnvironment()}`;

const loadTokens = (): Tokens | null => {
  try {
    const raw = localStorage.getItem(tokenKey());
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
};

export const clearTokens = () => localStorage.removeItem(tokenKey());
export const saveTokens = (tokens: Tokens) =>
  localStorage.setItem(tokenKey(), JSON.stringify(tokens));

const responseError = async (response: Response) => {
  try {
    const payload = (await response.json()) as { message?: string; detail?: string };
    return payload.message || payload.detail || `요청 실패 (${response.status})`;
  } catch {
    return `요청 실패 (${response.status})`;
  }
};

let refreshing: Promise<Tokens | null> | null = null;

const refreshTokens = async (): Promise<Tokens | null> => {
  const current = loadTokens();
  if (!current?.refreshToken) return null;
  if (!refreshing) {
    refreshing = fetch(`${apiOrigin()}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const next = (await response.json()) as Tokens;
        saveTokens(next);
        return next;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  const next = await refreshing;
  if (!next) clearTokens();
  return next;
};

const apiFetch = async <T>(path: string, init: RequestInit = {}, retry = true): Promise<T> => {
  const tokens = loadTokens();
  const response = await fetch(`${apiOrigin()}/api${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401 && retry && (await refreshTokens())) {
    return apiFetch<T>(path, init, false);
  }
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
};

const callbackUrl = () => new URL(`${import.meta.env.BASE_URL}oauth/callback`, location.origin).toString();

export const beginDiscordLogin = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(
    OAUTH_STATE_KEY,
    JSON.stringify({ state, environment: getSelectedEnvironment() }),
  );
  const query = new URLSearchParams({ redirectUrl: callbackUrl(), state });
  location.assign(`${apiOrigin()}/api/auth/oauth/discord?${query}`);
};

export const finishDiscordLogin = async (code: string, state: string): Promise<void> => {
  const rawExpected = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  let expected: { state: string; environment: Environment } | null = null;
  try {
    expected = rawExpected
      ? JSON.parse(rawExpected) as { state: string; environment: Environment }
      : null;
  } catch {
    expected = null;
  }
  if (
    !expected ||
    state !== expected.state ||
    getSelectedEnvironment() !== expected.environment
  ) {
    throw new Error("로그인 요청 상태 또는 환경이 일치하지 않습니다.");
  }
  const query = new URLSearchParams({ code, redirectUrl: callbackUrl() });
  const response = await fetch(`${apiOrigin()}/api/auth/oauth/discord/callback?${query}`);
  if (!response.ok) throw new Error(await responseError(response));
  saveTokens((await response.json()) as Tokens);
};

export const fetchProfile = () => apiFetch<UserProfile>("/user/me");
export const fetchComments = (page: number, limit: number, query: string) =>
  apiFetch<AdminCommentsPage>(
    `/admin/comments?page=${page}&limit=${limit}&query=${encodeURIComponent(query)}`,
  );
export const setCommentDisabled = (id: string, disabled: boolean) =>
  apiFetch<{ updated: boolean }>(`/admin/comments/${id}/disabled`, {
    method: "PUT",
    body: JSON.stringify({ disabled }),
  });
export const deleteComment = (id: string) =>
  apiFetch<{ deleted: boolean }>(`/admin/comments/${id}`, { method: "DELETE" });
export const importComments = async (comments: Record<string, unknown>[]) => {
  const total: ImportResult = { imported: 0, skipped: 0, errors: [] };
  for (let offset = 0; offset < comments.length; offset += 500) {
    const result = await apiFetch<ImportResult>("/admin/imports/comments", {
      method: "POST",
      body: JSON.stringify({ comments: comments.slice(offset, offset + 500) }),
    });
    total.imported += result.imported;
    total.skipped += result.skipped;
    total.errors.push(...result.errors);
  }
  return total;
};
