import tailwindcss from "@tailwindcss/vite";
import { defineConfig, WxtViteConfig } from 'wxt';

// `wxt prepare` runs during workspace installation before a build mode is selected.
// Every dev/build script still supplies its explicit environment origin.
const apiOrigin = process.env.WXT_API_ORIGIN ?? "http://localhost:3000";

const apiUrl = new URL(apiOrigin);
const apiHostPermission = `${apiUrl.protocol}//${apiUrl.host}/api/*`;

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: (): WxtViteConfig => ({
    plugins: [tailwindcss()],
  } as WxtViteConfig),
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  manifest: {
    name: "BoothPlus",
    description: "Browse community reviews directly on BOOTH product pages.",
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp7FZB6bFp2sn1uhlBE8K8hYQHsLaAl622sNlZhC/JEnhpKLNpp1DXbbBLyENUheH/yEd5McB3BvOJBNYD2w+Z7BjGvvCcGpBRiOoI/MHyrwqcDKzCdTbu8IQXqcSp2s+JPJhHMYZCwK7kLPV/5aT0x1n2SuizagWNIPeAgNU4vh04OQUXvb6gs/sMLbgH/F8S9ZNU/gOo0A/JabvEBmiMM/KgCTP8tu6m9bNittSdkzWAsheYV3i0MYAv1frhfI/QfoRb4PlP3jf92t4/TRM0/XwFMsVzD8SFRX6fMX/lf3j1tH1LWGJfpHHD0yeOLHsEFAwjJ3pDZcuWsNiL6tENQIDAQAB",
    default_locale: "ko",
    permissions: ["identity", "tabs", "storage", "sidePanel"],
    host_permissions: [apiHostPermission, "*://discord.com/*"],
    
  },
  webExt: {
    startUrls: ["https://booth.pm/ko/items/6571299", "https://jingo1016.booth.pm/items/5058077"],
  },
  zip: {
    name: "boothplus",
  },
  outDir: 'dist',
});
