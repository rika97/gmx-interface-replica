import { useMemo } from "react";
import { Trans, t } from "@lingui/macro";
import ExternalLink from "components/ExternalLink/ExternalLink";
import { getExplorerUrl } from "config/chains";
import {
  getTriggerPricePrefixForOrder,
  isIncreaseOrderType,
  isLimitOrderType,
  isLiquidationOrderType,
  isMarketOrderType,
  isSwapOrderType,
  isTriggerDecreaseOrderType,
} from "domain/synthetics/orders";
import { adaptToV1TokenInfo, getTokensRatioByAmounts } from "domain/synthetics/tokens";
import { TradeAction, TradeActionType } from "domain/synthetics/tradeHistory";
import { useChainId } from "lib/chains";
import { formatDateTime } from "lib/dates";
import { getExchangeRateDisplay } from "lib/legacy";
import { formatTokenAmount, formatUsd } from "lib/numbers";
import { BigNumber } from "ethers";
import { LiquidationTooltip } from "./LiquidationTooltip";
import "./TradeHistoryRow.scss";

type Props = {
  tradeAction: TradeAction;
  maxLeverage: BigNumber;
  minCollateralUsd: BigNumber;
};

function getOrderActionText(tradeAction: TradeAction) {
  let actionText = "";

  if (tradeAction.eventName === TradeActionType.OrderCreated) {
    actionText = t`Create`;
  }

  if (tradeAction.eventName === TradeActionType.OrderCancelled) {
    actionText = t`Cancel`;
  }

  if (tradeAction.eventName === TradeActionType.OrderExecuted) {
    actionText = t`Execute`;
  }

  if (tradeAction.eventName === TradeActionType.OrderUpdated) {
    actionText = t`Update`;
  }

  if (tradeAction.eventName === TradeActionType.OrderFrozen) {
    actionText = t`Freeze`;
  }

  return actionText;
}

function getSwapOrderMessage(tradeAction: TradeAction) {
  const tokenIn = tradeAction.initialCollateralToken!;
  const tokenOut = tradeAction.targetCollateralToken!;
  const amountIn = tradeAction.initialCollateralDeltaAmount!;

  const amountOut =
    tradeAction.eventName === TradeActionType.OrderExecuted
      ? tradeAction.executionAmountOut!
      : tradeAction.minOutputAmount!;

  const fromText = formatTokenAmount(amountIn, tokenIn?.decimals, tokenIn?.symbol);
  const toText = formatTokenAmount(amountOut, tokenOut?.decimals, tokenOut?.symbol);

  if (isLimitOrderType(tradeAction.orderType!)) {
    const actionText = getOrderActionText(tradeAction);

    const tokensRatio = getTokensRatioByAmounts({
      fromToken: tokenIn,
      toToken: tokenOut,
      fromTokenAmount: amountIn,
      toTokenAmount: amountOut,
    });

    const fromTokenInfo = tokenIn ? adaptToV1TokenInfo(tokenIn) : undefined;
    const toTokenInfo = tokenOut ? adaptToV1TokenInfo(tokenOut) : undefined;

    const [largest, smallest] =
      tokensRatio?.largestAddress === tokenIn?.address ? [fromTokenInfo, toTokenInfo] : [toTokenInfo, fromTokenInfo];

    const ratioText = getExchangeRateDisplay(tokensRatio?.ratio, largest, smallest);

    return t`${actionText} Order: Swap ${fromText} for ${toText}, Price: ${ratioText}`;
  }

  const actionText =
    tradeAction.eventName === TradeActionType.OrderCreated ? t`Request` : getOrderActionText(tradeAction);

  return t`${actionText} Swap ${fromText} for ${toText}`;
}

function getPositionOrderMessage(tradeAction: TradeAction, minCollateralUsd: BigNumber, maxLeverage: BigNumber) {
  const indexToken = tradeAction.indexToken;
  const collateralToken = tradeAction.initialCollateralToken;
  const sizeDeltaUsd = tradeAction.sizeDeltaUsd;
  const collateralDeltaAmount = tradeAction.initialCollateralDeltaAmount;

  if (!indexToken || !collateralToken) {
    return undefined;
  }

  const increaseText = isIncreaseOrderType(tradeAction.orderType!) ? t`Increase` : t`Decrease`;
  const longText = tradeAction.isLong ? t`Long` : t`Short`;
  const positionText = `${longText} ${indexToken.symbol}`;
  const sizeDeltaText = `${isIncreaseOrderType(tradeAction.orderType!) ? "+" : "-"}${formatUsd(sizeDeltaUsd)}`;

  if (isLimitOrderType(tradeAction.orderType!) || isTriggerDecreaseOrderType(tradeAction.orderType!)) {
    const acceptablePrice = tradeAction.acceptablePrice;
    const executionPrice = tradeAction.executionPrice;
    const pricePrefix = getTriggerPricePrefixForOrder(tradeAction.orderType!, tradeAction.isLong!);
    const actionText = getOrderActionText(tradeAction);

    if (tradeAction.eventName === TradeActionType.OrderExecuted) {
      return t`Execute Order: ${increaseText} ${positionText} ${sizeDeltaText}, ${indexToken.symbol} Price: ${formatUsd(
        executionPrice
      )}`;
    }

    return t`${actionText} Order: ${increaseText} ${positionText} ${sizeDeltaText}, ${
      indexToken.symbol
    } Price: ${pricePrefix} ${formatUsd(acceptablePrice)}`;
  }

  if (isMarketOrderType(tradeAction.orderType!)) {
    let actionText = {
      [TradeActionType.OrderCreated]: t`Request`,
      [TradeActionType.OrderExecuted]: "",
      [TradeActionType.OrderCancelled]: t`Cancel`,
      [TradeActionType.OrderUpdated]: t`Update`,
      [TradeActionType.OrderFrozen]: t`Freeze`,
    }[tradeAction.eventName!];

    if (sizeDeltaUsd?.gt(0)) {
      const pricePrefix = tradeAction.eventName === TradeActionType.OrderExecuted ? t`Price` : t`Acceptable Price`;
      const price =
        tradeAction.eventName === TradeActionType.OrderExecuted
          ? tradeAction.executionPrice
          : tradeAction.acceptablePrice;

      return t`${actionText} ${increaseText} ${positionText} ${sizeDeltaText}, ${pricePrefix}: ${formatUsd(price)}`;
    } else {
      const collateralText = formatTokenAmount(collateralDeltaAmount, collateralToken.decimals, collateralToken.symbol);

      if (isIncreaseOrderType(tradeAction.orderType!)) {
        return t`${actionText} Deposit ${collateralText} into ${positionText}`;
      } else {
        return t`${actionText} Withdraw ${collateralText} from ${positionText}`;
      }
    }
  }

  if (isLiquidationOrderType(tradeAction.orderType!) && tradeAction.eventName === TradeActionType.OrderExecuted) {
    const executionPrice = tradeAction.executionPrice;

    return (
      <>
        <LiquidationTooltip tradeAction={tradeAction} minCollateralUsd={minCollateralUsd} maxLeverage={maxLeverage} />
        {" "}
        <Trans>
          {positionText} {sizeDeltaText}, Price: {formatUsd(executionPrice)}
        </Trans>
      </>
    );
  }

  return undefined;
}

export function TradeHistoryRow(p: Props) {
  const { chainId } = useChainId();
  const { tradeAction, minCollateralUsd, maxLeverage } = p;

  const msg = useMemo(() => {
    if (isSwapOrderType(tradeAction.orderType!)) {
      return getSwapOrderMessage(tradeAction);
    } else {
      return getPositionOrderMessage(tradeAction, minCollateralUsd, maxLeverage);
    }
  }, [maxLeverage, minCollateralUsd, tradeAction]);

  if (!msg) return null;

  return (
    <div className="TradeHistoryRow App-box App-box-border">
      <div className="muted TradeHistoryRow-time">{formatDateTime(tradeAction.transaction.timestamp)}</div>
      <ExternalLink className="plain" href={`${getExplorerUrl(chainId)}tx/${tradeAction.transaction.hash}`}>
        {msg}
      </ExternalLink>
    </div>
  );
}
