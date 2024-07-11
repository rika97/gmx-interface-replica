import { ARBITRUM, ARBITRUM_GOERLI, AVALANCHE, BSС_MAINNET, HARMONY } from "./chains";

export const GMX_STATS_API_URL = "https://stats.gmx.io/api";

const BACKEND_URLS = {
  default: "https://stats.gmx.io",

  [BSС_MAINNET]: "https://gambit-server-staging.uc.r.appspot.com",
  [ARBITRUM_GOERLI]: "https://gambit-server-devnet.uc.r.appspot.com",
  [ARBITRUM]: "https://gmx-server-mainnet.uw.r.appspot.com",
  [AVALANCHE]: "https://gmx-avax-server.uc.r.appspot.com",
  [HARMONY]: "https://gmx-harmony.uw.r.appspot.com",
};

export function getServerBaseUrl(chainId: number) {
  if (!chainId) {
    throw new Error("chainId is not provided");
  }

  if (document.location.hostname.includes("deploy-preview")) {
    const fromLocalStorage = localStorage.getItem("SERVER_BASE_URL");
    if (fromLocalStorage) {
      return fromLocalStorage;
    }
  }

  return BACKEND_URLS[chainId] || BACKEND_URLS.default;
}

export function getServerUrl(chainId: number, path: string) {
  return `${getServerBaseUrl(chainId)}${path}`;
}
