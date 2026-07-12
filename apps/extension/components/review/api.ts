import { ApiError, readResponseText } from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { API_BASE } from "./config";
import { sendMessage } from "./messaging";
import type {
  AuthToken,
  CommentBody,
  CommentItem,
  CommentsPage,
  UserProfile,
} from "./types";

export { API_BASE } from "./config";

const defaultHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const performFetch = async <T>(url: string, init: RequestInit, attempt = 0): Promise<T> => {
  const tokens = await authTokenStorage.getValue();
  const accessToken = tokens?.accessToken;
  const response = await fetch(url, {
    credentials: "include",
    mode: "cors",
    headers: {
      ...defaultHeaders,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  if (response.status === 401 && attempt === 0) {
    const refreshed = await sendMessage("refreshSession");
    if (refreshed) {
      return performFetch(url, init, attempt + 1);
    }

    // An expired/revoked token must not prevent anonymous public actions.
    // Clear the stale token and retry once without an Authorization header;
    // protected endpoints will still return 401 on the second attempt.
    await authTokenStorage.setValue(null);
    return performFetch(url, init, attempt + 1);
  }

  const message = await readResponseText(response);
  throw new ApiError(message, response.status);
};

export const apiFetch = <T>(path: string, init: RequestInit = {}) => {
  const url = `${API_BASE}${path}`;
  return performFetch<T>(url, init);
};

export const fetchUserProfile = async (): Promise<UserProfile | null> => {
  try {
    const response = await apiFetch<UserProfile>("/user/me");
    return response ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
};

export const fetchComments = async (
  itemId: string,
  page = 1,
  limit = 10,
): Promise<CommentsPage> => {
  const payload = await apiFetch<{ count: number; comments: CommentItem[] }>(
    `/comment?productId=${encodeURIComponent(itemId)}&page=${page}&limit=${limit}`,
  );
  return {
    count: typeof payload?.count === "number" ? payload.count : 0,
    comments: Array.isArray(payload?.comments) ? payload.comments : [],
    page,
    pageSize: limit,
  };
};

export const fetchMyComments = async (
  page = 1,
  limit = 5,
): Promise<{ count: number; comments: CommentItem[] }> => {
  const payload = await apiFetch<{ count: number; comments: CommentItem[] }>(
    `/comment/my?page=${page}&limit=${limit}`,
  );
  return {
    count: typeof payload?.count === "number" ? payload.count : 0,
    comments: Array.isArray(payload?.comments) ? payload.comments : [],
  };
};

export const createComment = (itemId: string, body: CommentBody) =>
  apiFetch<{ id: string }>(`/comment/${itemId}`, {
  method: "POST",
  body: JSON.stringify(body),
});

export const updateComment = (commentId: string, body: CommentBody) =>
  apiFetch<{ updated: boolean }>(`/comment/${commentId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deleteComment = (commentId: string, password?: string) =>
  apiFetch<{ deleted: boolean }>(`/comment/${commentId}`, {
    method: "DELETE",
    body: password ? JSON.stringify({ password }) : undefined,
  });

export const voteComment = (commentId: string, direction: "upvote" | "downvote") =>
  apiFetch<{ updated: boolean }>(`/comment/${commentId}/${direction}`, { method: "POST" });

export const exchangeDiscordCode = (code: string, redirectUrl: string) =>
  apiFetch<AuthToken>(
    `/auth/oauth/discord/callback?code=${encodeURIComponent(code)}&redirectUrl=${encodeURIComponent(redirectUrl)}`,
  );

export const revokeSession = async (refreshToken: string) => {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    mode: "cors",
    headers: defaultHeaders,
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    throw new ApiError(await readResponseText(response), response.status);
  }
};

const updateUserField = (path: string, body: Record<string, unknown>) =>
  apiFetch<{ updated: boolean }>(path, { method: "PUT", body: JSON.stringify(body) });

export const updateUserAutoCollapse = (autoCollapse: boolean) =>
  updateUserField("/user/autoCollapse", { autoCollapse });
export const updateUserHideAvatar = (hideAvatar: boolean) =>
  updateUserField("/user/hideAvatar", { hideAvatar });
export const updateUsername = (username: string) => updateUserField("/user/username", { username });
export const updateBio = (bio: string) => updateUserField("/user/bio", { bio });
