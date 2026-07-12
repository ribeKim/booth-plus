import { authTokenStorage } from "@/utils/storage";
import { API_BASE } from "./config";
import type { AuthToken } from "./types";

let refreshPromise: Promise<boolean> | null = null;

const refresh = async (): Promise<boolean> => {
  const current = await authTokenStorage.getValue();
  if (!current?.refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });

    if (!response.ok) {
      const latest = await authTokenStorage.getValue();
      if (latest?.refreshToken !== current.refreshToken) return Boolean(latest);
      if (response.status === 401 || response.status === 403) {
        await authTokenStorage.setValue(null);
      }
      return false;
    }

    const next = (await response.json()) as AuthToken;
    const latest = await authTokenStorage.getValue();
    if (latest?.refreshToken !== current.refreshToken) return Boolean(latest);
    await authTokenStorage.setValue(next);
    return true;
  } catch {
    return false;
  }
};

export const refreshSession = () => {
  refreshPromise ??= refresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};
