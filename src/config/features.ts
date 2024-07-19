import { ARBITRUM, AVALANCHE, HARMONY } from "./chains";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getIsSyntheticsSupported(chainId: number) {
  return false;
}

export function getIsV1Supported(chainId: number) {
  return [AVALANCHE, ARBITRUM, HARMONY].includes(chainId);
}
