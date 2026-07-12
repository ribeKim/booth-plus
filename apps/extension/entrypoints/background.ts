import { onMessage } from "@/components/review/messaging";
import { refreshSession } from "@/components/review/session";
import { browser } from "wxt/browser";

export default defineBackground(() => {
  onMessage("loginWithDiscord", async (message) => {
    const response = await browser.identity.launchWebAuthFlow({
      url: message.data,
      interactive: true,
    });

    if (!response) return null;
    const callback = new URL(response);
    const code = callback.searchParams.get("code");
    const state = callback.searchParams.get("state");
    return code && state ? { code, state } : null;
  });

  onMessage("refreshSession", refreshSession);
});
