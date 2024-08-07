import { SyntheticsState } from "../SyntheticsStateContextProvider";
import { createSelector, createSelectorFactory } from "../utils";
import { BigNumber } from "ethers";
import {
  selectTradeboxTradeFlags,
  selectTradeboxIncreasePositionAmounts,
  selectTradeboxSelectedPosition,
} from "./tradeboxSelectors";
import { prepareInitialEntries } from "domain/synthetics/sidecarOrders/utils";
import {
  selectConfirmationBoxExistingSlOrders,
  selectConfirmationBoxExistingTpOrders,
  selectConfirmationBoxExistingLimitOrders,
} from "./confirmationBoxSelectors";

export const selectConfirmationBoxSidecarOrdersSlEntries = (state: SyntheticsState) =>
  state.confirmationBox.sidecarOrders.slEntries;
export const selectConfirmationBoxSidecarOrdersSetSlEntries = (state: SyntheticsState) =>
  state.confirmationBox.sidecarOrders.setSlEntries;
export const selectConfirmationBoxSidecarOrdersTpEntries = (state: SyntheticsState) =>
  state.confirmationBox.sidecarOrders.tpEntries;
export const selectConfirmationBoxSidecarOrdersSetTpEntries = (state: SyntheticsState) =>
  state.confirmationBox.sidecarOrders.setTpEntries;
export const selectConfirmationBoxSidecarOrdersLimitEntries = (state: SyntheticsState) =>
  state.confirmationBox.sidecarOrders.limitEntries;
export const selectConfirmationBoxSidecarOrdersSetLimitEntries = (state: SyntheticsState) =>
  state.confirmationBox.sidecarOrders.setLimitEntries;

// getters
export const makeSelectConfirmationBoxSidecarOrdersEntries = createSelectorFactory((group: "tp" | "sl" | "limit") =>
  createSelector(function selectSidecarOrdersEntriesByGroup(q) {
    return {
      tp: () => q(selectConfirmationBoxSidecarOrdersTpEntries),
      sl: () => q(selectConfirmationBoxSidecarOrdersSlEntries),
      limit: () => q(selectConfirmationBoxSidecarOrdersLimitEntries),
    }[group]();
  })
);

// setters
export const makeSelectConfirmationBoxSidecarOrdersSetEntries = createSelectorFactory((group: "tp" | "sl" | "limit") =>
  createSelector(function selectSidecarOrdersEntriesByGroup(q) {
    return {
      tp: () => q(selectConfirmationBoxSidecarOrdersSetTpEntries),
      sl: () => q(selectConfirmationBoxSidecarOrdersSetSlEntries),
      limit: () => q(selectConfirmationBoxSidecarOrdersSetLimitEntries),
    }[group]();
  })
);

export const makeSelectConfirmationBoxSidecarOrdersState = createSelectorFactory((group: "tp" | "sl" | "limit") =>
  createSelector(function selectSidecarOrdersStateByGroup(q) {
    const entries = q(makeSelectConfirmationBoxSidecarOrdersEntries(group));
    const setEntries = q(makeSelectConfirmationBoxSidecarOrdersSetEntries(group));

    return [entries, setEntries] as const;
  })
);

export const makeSelectConfirmationBoxSidecarOrdersTotalPercentage = createSelectorFactory(
  (group: "tp" | "sl" | "limit") =>
    createSelector(function selectSidecarOrdersTotalPercentageByGroup(q) {
      const entries = q(makeSelectConfirmationBoxSidecarOrdersEntries(group));

      return entries
        .filter((entry) => entry.txnType !== "cancel")
        .reduce<BigNumber>(
          (total, entry) => (entry.percentage?.value ? total.add(entry.percentage.value) : total),
          BigNumber.from(0)
        );
    })
);

export const selectConfirmationBoxSidecarOrdersTotalSizeUsd = createSelector((q) => {
  const existingPosition = q(selectTradeboxSelectedPosition);
  const increaseAmounts = q(selectTradeboxIncreasePositionAmounts);
  const limitEntries = q(selectConfirmationBoxSidecarOrdersLimitEntries);

  let result = BigNumber.from(0);

  if (existingPosition?.sizeInUsd) {
    result = result.add(existingPosition?.sizeInUsd ?? 0);
  }

  if (increaseAmounts?.sizeDeltaUsd) {
    result = result.add(increaseAmounts?.sizeDeltaUsd ?? 0);
  }

  limitEntries?.forEach((e) => {
    if (e.txnType !== "cancel") {
      result = result.add(e.sizeUsd.value ?? 0);
    }
  });

  return result;
});

export const selectConfirmationBoxSidecarOrdersExistingSlEntries = createSelector((q) => {
  const existingSlOrders = q(selectConfirmationBoxExistingSlOrders);
  const { isLong } = q(selectTradeboxTradeFlags);

  return prepareInitialEntries({ positionOrders: existingSlOrders, sort: isLong ? "desc" : "asc" });
});

export const selectConfirmationBoxSidecarOrdersExistingTpEntries = createSelector((q) => {
  const existingTpOrders = q(selectConfirmationBoxExistingTpOrders);
  const { isLong } = q(selectTradeboxTradeFlags);

  return prepareInitialEntries({ positionOrders: existingTpOrders, sort: isLong ? "asc" : "desc" });
});

export const selectConfirmationBoxSidecarOrdersExistingLimitEntries = createSelector((q) => {
  const existingLimitOrders = q(selectConfirmationBoxExistingLimitOrders);

  return prepareInitialEntries({ positionOrders: existingLimitOrders, sort: "desc" });
});
