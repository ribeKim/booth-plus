import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  loginWithDiscord(url: string): { code: string; state: string } | null;
  refreshSession(): boolean;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
