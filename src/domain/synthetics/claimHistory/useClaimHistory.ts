import { gql } from "@apollo/client";
import { getToken } from "config/tokens";
import { useMarketsInfoData, useTokensData } from "context/SyntheticsStateContext/hooks/globalsHooks";
import { MarketsInfoData } from "domain/synthetics/markets";
import { BigNumber } from "ethers";
import { getAddress } from "ethers/lib/utils.js";
import { bigNumberify } from "lib/numbers";
import { getByKey } from "lib/objects";
import { buildFiltersBody, getSyntheticsGraphClient } from "lib/subgraph";
import useWallet from "lib/wallets/useWallet";
import { useMemo } from "react";
import useSWRInfinite, { SWRInfiniteResponse } from "swr/infinite";
import { useFixedAddreseses } from "../common/useFixedAddresses";
import { ClaimAction, ClaimCollateralAction, ClaimFundingFeeAction, ClaimMarketItem, ClaimType } from "./types";

export type ClaimCollateralHistoryResult = {
  claimActions?: ClaimAction[];
  isLoading: boolean;
  pageIndex: number;
  setPageIndex: (...args: Parameters<SWRInfiniteResponse["setSize"]>) => void;
};

type RawClaimAction = {
  id: string;
  eventName: ClaimType;
  account: string;
  marketAddresses: string[];
  tokenAddresses: string[];
  amounts: string[];
  tokenPrices: string[];
  isLongOrders?: boolean[];
  transaction: {
    timestamp: number;
    hash: string;
  };
};

export function useClaimCollateralHistory(
  chainId: number,
  p: {
    pageSize: number;
    fromTxTimestamp?: number;
    toTxTimestamp?: number;
    eventName?: string[];
    marketAddresses?: string[];
  }
): ClaimCollateralHistoryResult {
  const { pageSize, fromTxTimestamp, toTxTimestamp, eventName, marketAddresses } = p;
  const marketsInfoData = useMarketsInfoData();
  const tokensData = useTokensData();

  const { account } = useWallet();
  const fixedAddresses = useFixedAddreseses(marketsInfoData, tokensData);
  const client = getSyntheticsGraphClient(chainId);

  const queryDisabled = !chainId || !client || !account;

  const key = (pageIndex: number) => {
    if (queryDisabled) {
      return null;
    }

    return [
      chainId,
      "useClaimHistory",
      account,
      pageIndex,
      pageSize,
      fromTxTimestamp,
      toTxTimestamp,
      structuredClone(eventName)?.sort().join(","),
      structuredClone(marketAddresses)?.sort().join(","),
    ];
  };

  const {
    data,
    error,
    size: pageIndex,
    setSize: setPageIndex,
  } = useSWRInfinite<RawClaimAction[]>(key, {
    fetcher: async (key) => {
      const pageIndex = key[3];
      const skip = pageIndex * pageSize;
      const first = pageSize;

      const filterStr = buildFiltersBody({
        and: [
          {
            account: account!.toLowerCase(),
            transaction: {
              timestamp_gte: fromTxTimestamp,
              timestamp_lte: toTxTimestamp,
            },
            eventName_in: eventName,
          },
          {
            or: marketAddresses?.map((tokenAddress) => ({
              marketAddresses_contains: [tokenAddress.toLowerCase()],
            })),
          },
        ],
      });

      const whereClause = `where: ${filterStr}`;

      const query = gql(`{
        claimActions(
            skip: ${skip},
            first: ${first},
            orderBy: transaction__timestamp,
            orderDirection: desc,
            ${whereClause}
        ) {
            id
            account
            eventName
            marketAddresses
            tokenAddresses
            amounts
            tokenPrices
            isLongOrders
            transaction {
                timestamp
                hash
            }
        }
      }`);

      const { data } = await client!.query({ query, fetchPolicy: "no-cache" });

      return data.claimActions as RawClaimAction[];
    },
  });

  const isLoading = (!error && !data) || !marketsInfoData || !tokensData;

  const claimActions = useMemo(() => {
    if (!data || !tokensData || !marketsInfoData) {
      return undefined;
    }

    return data.flat().reduce((acc, rawAction) => {
      const eventName = rawAction.eventName;

      switch (eventName) {
        case ClaimType.ClaimFunding:
        case ClaimType.ClaimPriceImpact: {
          const claimCollateralAction = createClaimCollateralAction(
            chainId,
            eventName,
            rawAction,
            fixedAddresses,
            marketsInfoData
          );

          return claimCollateralAction ? [...acc, claimCollateralAction] : acc;
        }

        case ClaimType.SettleFundingFeeCreated:
        case ClaimType.SettleFundingFeeExecuted:
        case ClaimType.SettleFundingFeeCancelled: {
          const settleAction = createSettleFundingFeeAction(chainId, eventName, rawAction, marketsInfoData);
          return settleAction ? [...acc, settleAction] : acc;
        }
        default:
          return acc;
      }
    }, [] as ClaimAction[]);
  }, [chainId, data, fixedAddresses, marketsInfoData, tokensData]);

  return {
    claimActions,
    isLoading,
    pageIndex,
    setPageIndex,
  };
}

function createClaimCollateralAction(
  chainId: number,
  eventName: ClaimCollateralAction["eventName"],
  rawAction: RawClaimAction,
  fixedAddresses: Record<string, string>,
  marketsInfoData: MarketsInfoData | undefined
): ClaimCollateralAction | null {
  const tokens = rawAction.tokenAddresses.map((address) => getToken(chainId, getAddress(address))).filter(Boolean);

  const claimItemsMap: { [marketAddress: string]: ClaimMarketItem } = {};
  const claimAction: ClaimCollateralAction = {
    id: rawAction.id,
    type: "collateral",
    eventName,
    account: rawAction.account,
    claimItems: [],
    timestamp: rawAction.transaction.timestamp,
    transactionHash: rawAction.transaction.hash,
    tokens,
    amounts: rawAction.amounts.map((amount) => bigNumberify(amount)!),
    tokenPrices: rawAction.tokenPrices.map((price) => bigNumberify(price)!),
  };

  for (let i = 0; i < rawAction.marketAddresses.length; i++) {
    const marketAddress = fixedAddresses[rawAction.marketAddresses[i]];
    const tokenAddress = fixedAddresses[rawAction.tokenAddresses[i]];
    const amount = bigNumberify(rawAction.amounts[i])!;
    const marketInfo = getByKey(marketsInfoData, marketAddress);

    if (!marketInfo) {
      return null;
    }

    if (!claimItemsMap[marketInfo.marketTokenAddress]) {
      claimItemsMap[marketInfo.marketTokenAddress] = {
        marketInfo: marketInfo,
        longTokenAmount: BigNumber.from(0),
        shortTokenAmount: BigNumber.from(0),
      };
    }

    if (tokenAddress === marketInfo.longTokenAddress) {
      claimItemsMap[marketAddress].longTokenAmount = claimItemsMap[marketAddress].longTokenAmount.add(amount);
    } else {
      claimItemsMap[marketAddress].shortTokenAmount = claimItemsMap[marketAddress].shortTokenAmount.add(amount);
    }
  }

  claimAction.claimItems = Object.values(claimItemsMap);

  return claimAction;
}

function createSettleFundingFeeAction(
  chainId: number,
  eventName: ClaimFundingFeeAction["eventName"],
  rawAction: RawClaimAction,
  marketsInfoData: MarketsInfoData | null
): ClaimFundingFeeAction | null {
  if (!marketsInfoData) return null;

  const markets = rawAction.marketAddresses
    .map((address) => getByKey(marketsInfoData, getAddress(address))!)
    .filter(Boolean);

  if (!markets.length) return null;

  const tokens = rawAction.tokenAddresses.map((address) => getToken(chainId, getAddress(address))).filter(Boolean);

  return {
    id: rawAction.id,
    type: "fundingFee",
    account: rawAction.account,
    amounts: rawAction.amounts.map((amount) => bigNumberify(amount)!),
    tokenPrices: rawAction.tokenPrices.map((price) => bigNumberify(price)!),
    markets,
    tokens,
    isLongOrders: rawAction.isLongOrders ?? [],
    transactionHash: rawAction.transaction.hash,
    eventName,
    timestamp: rawAction.transaction.timestamp,
  };
}
