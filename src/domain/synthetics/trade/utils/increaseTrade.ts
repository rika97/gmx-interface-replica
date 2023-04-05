import { getPositionFee, getPriceImpactForPosition } from "domain/synthetics/fees";
import { MarketInfo } from "domain/synthetics/markets";
import { PositionInfo } from "domain/synthetics/positions";
import { TokenData, convertToTokenAmount, convertToUsd } from "domain/synthetics/tokens";
import { BigNumber } from "ethers";
import { BASIS_POINTS_DIVISOR } from "lib/legacy";
import { IncreasePositionAmounts, IncreasePositionTradeParams, NextPositionValues, SwapPathStats } from "../types";
import { getDisplayedTradeFees } from "./common";
import { applySlippage, getAcceptablePrice, getMarkPrice } from "./prices";
import { getSwapAmounts } from "./swapTrade";

export function getIncreasePositionTradeParams(p: {
  marketInfo: MarketInfo;
  initialCollateralToken: TokenData;
  collateralToken: TokenData;
  indexToken: TokenData;
  initialCollateralAmount?: BigNumber;
  indexTokenAmount?: BigNumber;
  isLong: boolean;
  leverage?: BigNumber;
  triggerPrice?: BigNumber;
  existingPosition?: PositionInfo;
  showPnlInLeverage?: boolean;
  isLimit?: boolean;
  allowedSlippage?: number;
  acceptablePriceImpactBps?: BigNumber;
  maxLeverage?: BigNumber;
  findSwapPath: (usdIn: BigNumber, opts?: { disablePriceImpact?: boolean }) => SwapPathStats | undefined;
}): IncreasePositionTradeParams | undefined {
  const increasePositionAmounts = getIncreasePositionAmounts(p);

  if (!increasePositionAmounts) {
    return undefined;
  }

  const nextPositionValues = getNextPositionValuesForIncreaseTrade({
    marketInfo: p.marketInfo,
    existingPosition: p.existingPosition,
    sizeDeltaUsd: increasePositionAmounts.sizeDeltaUsd,
    collateralDeltaUsd: increasePositionAmounts.collateralUsd,
    showPnlInLeverage: p.showPnlInLeverage,
    leverage: p.leverage,
    entryMarkPrice: increasePositionAmounts.entryMarkPrice,
    isLong: p.isLong,
    maxLeverage: p.maxLeverage,
  });

  const fees = getDisplayedTradeFees({
    marketInfo: p.marketInfo,
    initialCollateralUsd: increasePositionAmounts.initialCollateralUsd,
    sizeDeltaUsd: increasePositionAmounts.sizeDeltaUsd,
    swapSteps: increasePositionAmounts.swapPathStats?.swapSteps,
    positionFeeUsd: increasePositionAmounts.positionFeeUsd,
    swapPriceImpactDeltaUsd: !p.isLimit
      ? increasePositionAmounts.swapPathStats?.totalSwapPriceImpactDeltaUsd
      : undefined,
    positionPriceImpactDeltaUsd: !p.isLimit ? increasePositionAmounts.positionPriceImpactDeltaUsd : undefined,
  });

  return {
    ...increasePositionAmounts,
    market: p.marketInfo,
    initialCollateralToken: p.initialCollateralToken,
    collateralToken: p.collateralToken,
    isLong: p.isLong,
    nextPositionValues,
    fees,
  };
}

export function getNextPositionValuesForIncreaseTrade(p: {
  marketInfo: MarketInfo;
  existingPosition?: PositionInfo;
  sizeDeltaUsd: BigNumber;
  collateralDeltaUsd: BigNumber;
  showPnlInLeverage?: boolean;
  leverage?: BigNumber;
  entryMarkPrice?: BigNumber;
  isLong?: boolean;
  maxLeverage?: BigNumber;
}): NextPositionValues {
  const nextSizeUsd = p.existingPosition ? p.existingPosition?.sizeInUsd.add(p.sizeDeltaUsd) : p.sizeDeltaUsd;

  const nextCollateralUsd = p.existingPosition?.initialCollateralUsd
    ? p.existingPosition?.initialCollateralUsd.add(p.collateralDeltaUsd)
    : p.collateralDeltaUsd;

  // const nextLeverage = getLeverage({
  //   sizeInUsd: nextSizeUsd,
  //   collateralUsd: nextCollateralUsd,
  //   pnl: p.showPnlInLeverage ? p.existingPosition?.pnl : undefined,
  //   pendingBorrowingFeesUsd: p.existingPosition?.pendingBorrowingFeesUsd, // deducted on order
  //   pendingFundingFeesUsd: p.existingPosition?.pendingFundingFeesUsd, // deducted on order
  // });

  // const nextLiqPrice = getLiquidationPrice({
  //   sizeUsd: nextSizeUsd,
  //   collateralUsd: nextCollateralUsd,
  //   indexPrice: p.entryMarkPrice,
  //   positionFeeFactor: p.marketInfo.positionFeeFactor,
  //   maxPriceImpactFactor: p.marketInfo?.maxPositionImpactFactorForLiquidations,
  //   pendingBorrowingFeesUsd: p.existingPosition?.pendingBorrowingFeesUsd, // deducted on order
  //   pendingFundingFeesUsd: p.existingPosition?.pendingFundingFeesUsd, // deducted on order
  //   pnl: p.existingPosition?.pnl,
  //   isLong: p.isLong,
  //   maxLeverage: p.maxLeverage,
  // });

  return {
    nextSizeUsd,
    nextCollateralUsd,
    nextLeverage: undefined,
    nextLiqPrice: undefined,
    nextEntryPrice: p.entryMarkPrice,
  };
}

/**
 * Calculates amounts for increasing position (sizeDelta by initialCollateralAmount or initialCollateralAmount by indexTokenAmount)
 */
export function getIncreasePositionAmounts(p: {
  marketInfo: MarketInfo;
  initialCollateralToken: TokenData;
  collateralToken: TokenData;
  indexToken: TokenData;
  initialCollateralAmount?: BigNumber;
  indexTokenAmount?: BigNumber;
  isLong: boolean;
  leverage?: BigNumber;
  triggerPrice?: BigNumber;
  isLimit?: boolean;
  allowedSlippage?: number;
  acceptablePriceImpactBps?: BigNumber;
  findSwapPath: (usdIn: BigNumber, opts?: { disablePriceImpact?: boolean }) => SwapPathStats | undefined;
}): IncreasePositionAmounts | undefined {
  const markPrice = getMarkPrice({ prices: p.indexToken.prices, isIncrease: true, isLong: p.isLong })!;
  const triggerPrice = p.isLimit ? p.triggerPrice : undefined;
  const entryMarkPrice = triggerPrice || markPrice;

  if (!markPrice) return undefined;

  const defaultAmounts: IncreasePositionAmounts = {
    initialCollateralAmount: BigNumber.from(0),
    initialCollateralUsd: BigNumber.from(0),
    collateralAmount: BigNumber.from(0),
    collateralUsd: BigNumber.from(0),
    collateralUsdAfterFees: BigNumber.from(0),
    sizeDeltaUsd: BigNumber.from(0),
    sizeDeltaInTokens: BigNumber.from(0),
    sizeDeltaAfterFeesUsd: BigNumber.from(0),
    sizeDeltaAfterFeesInTokens: BigNumber.from(0),
    acceptablePrice: entryMarkPrice,
    acceptablePriceImpactBps: p.isLimit && p.acceptablePriceImpactBps ? p.acceptablePriceImpactBps : BigNumber.from(0),
    acceptablePriceAfterSlippage: entryMarkPrice,
    entryMarkPrice,
    triggerPrice,
  };

  if (!p.indexTokenAmount) {
    // calculate indexTokenAmount by initialCollateralAmount
    const swapAmounts = getSwapAmounts({
      tokenIn: p.initialCollateralToken,
      tokenOut: p.collateralToken,
      tokenInAmount: p.initialCollateralAmount,
      findSwapPath: p.findSwapPath,
      isLimit: p.isLimit,
    });

    if (!swapAmounts?.amountOut.gt(0)) {
      return defaultAmounts;
    }

    const initialCollateralAmount = swapAmounts.amountIn;
    const initialCollateralUsd = swapAmounts.usdIn;

    let collateralUsd = swapAmounts.usdOut;
    let collateralAmount = swapAmounts.amountOut;

    let sizeDeltaUsd = collateralUsd;

    if (p.leverage) {
      sizeDeltaUsd = sizeDeltaUsd.mul(p.leverage).div(BASIS_POINTS_DIVISOR);
    }

    const positionFeeUsd = getPositionFee(p.marketInfo, sizeDeltaUsd) || BigNumber.from(0);

    const positionPriceImpactDeltaUsd =
      getPriceImpactForPosition(p.marketInfo, sizeDeltaUsd, p.isLong) || BigNumber.from(0);

    const sizeDeltaAfterFeesUsd = sizeDeltaUsd.sub(positionFeeUsd);
    const collateralUsdAfterFees = collateralUsd.sub(positionFeeUsd);

    const {
      acceptablePrice = entryMarkPrice,
      acceptablePriceImpactBps = p.acceptablePriceImpactBps || BigNumber.from(0),
    } =
      getAcceptablePrice({
        isIncrease: true,
        isLong: p.isLong,
        indexPrice: entryMarkPrice,
        sizeDeltaUsd: sizeDeltaAfterFeesUsd,
        priceImpactDeltaUsd: !p.isLimit ? positionPriceImpactDeltaUsd : undefined,
        acceptablePriceImpactBps: p.isLimit ? p.acceptablePriceImpactBps : undefined,
      }) || {};

    const acceptablePriceAfterSlippage = applySlippage(p.allowedSlippage || 0, acceptablePrice, true, p.isLong);

    const sizeDeltaInTokens =
      convertToTokenAmount(sizeDeltaAfterFeesUsd, p.indexToken.decimals, acceptablePrice) || BigNumber.from(0);
    const sizeDeltaAfterFeesInTokens =
      convertToTokenAmount(sizeDeltaAfterFeesUsd, p.indexToken.decimals, acceptablePrice) || BigNumber.from(0);

    return {
      initialCollateralAmount,
      initialCollateralUsd,
      collateralAmount: collateralAmount,
      collateralUsd: collateralUsd,
      collateralUsdAfterFees,
      sizeDeltaUsd,
      sizeDeltaInTokens,
      sizeDeltaAfterFeesUsd,
      sizeDeltaAfterFeesInTokens,
      positionFeeUsd,
      positionPriceImpactDeltaUsd,
      acceptablePrice,
      acceptablePriceImpactBps,
      acceptablePriceAfterSlippage,
      entryMarkPrice,
      triggerPrice,
      swapPathStats: swapAmounts.swapPathStats,
    };
  } else {
    // calculate initialCollateralAmount by indexTokenAmount
    if (!p.indexTokenAmount.gt(0)) {
      return defaultAmounts;
    }

    const sizeDeltaAfterFeesInTokens = p.indexTokenAmount;
    const sizeDeltaAfterFeesUsd =
      convertToUsd(sizeDeltaAfterFeesInTokens, p.indexToken.decimals, entryMarkPrice) || BigNumber.from(0);

    const positionFeeUsd = getPositionFee(p.marketInfo, sizeDeltaAfterFeesUsd) || BigNumber.from(0);

    let sizeDeltaUsd = sizeDeltaAfterFeesUsd.add(positionFeeUsd);

    const positionPriceImpactDeltaUsd =
      getPriceImpactForPosition(p.marketInfo, sizeDeltaUsd, p.isLong) || BigNumber.from(0);

    const {
      acceptablePrice = entryMarkPrice,
      acceptablePriceImpactBps = p.acceptablePriceImpactBps || BigNumber.from(0),
    } =
      getAcceptablePrice({
        isIncrease: true,
        isLong: p.isLong,
        indexPrice: entryMarkPrice,
        sizeDeltaUsd,
        priceImpactDeltaUsd: !p.isLimit ? positionPriceImpactDeltaUsd : undefined,
        acceptablePriceImpactBps: p.isLimit ? p.acceptablePriceImpactBps : undefined,
      }) || {};

    const acceptablePriceAfterSlippage = applySlippage(p.allowedSlippage || 0, acceptablePrice, true, p.isLong);

    sizeDeltaUsd = sizeDeltaUsd.add(positionPriceImpactDeltaUsd);
    const sizeDeltaInTokens =
      convertToTokenAmount(sizeDeltaUsd, p.indexToken.decimals, acceptablePrice) || BigNumber.from(0);

    let collateralUsd = sizeDeltaUsd;

    if (p.leverage) {
      collateralUsd = collateralUsd.mul(BASIS_POINTS_DIVISOR).div(p.leverage);
    }

    const collateralAmount =
      convertToTokenAmount(collateralUsd, p.collateralToken.decimals, p.collateralToken.prices?.maxPrice) ||
      BigNumber.from(0);

    const swapAmounts = getSwapAmounts({
      tokenIn: p.initialCollateralToken,
      tokenOut: p.collateralToken,
      tokenOutAmount: collateralAmount,
      findSwapPath: p.findSwapPath,
      isLimit: p.isLimit,
    });

    const initialCollateralAmount = swapAmounts?.amountIn || BigNumber.from(0);
    const initialCollateralUsd = swapAmounts?.usdIn || BigNumber.from(0);

    return {
      initialCollateralAmount,
      initialCollateralUsd,
      collateralAmount: collateralAmount,
      collateralUsd: collateralUsd,
      collateralUsdAfterFees: collateralUsd,
      sizeDeltaUsd,
      sizeDeltaInTokens,
      sizeDeltaAfterFeesUsd,
      sizeDeltaAfterFeesInTokens,
      positionFeeUsd,
      positionPriceImpactDeltaUsd,
      acceptablePrice,
      acceptablePriceImpactBps,
      acceptablePriceAfterSlippage,
      entryMarkPrice,
      triggerPrice,
      swapPathStats: swapAmounts?.swapPathStats,
    };
  }
}
