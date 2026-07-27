import { useCallback } from "react";
import type { Locale } from "../../i18n/locale.ts";
import { messagesFor } from "../../i18n/messages/index.ts";
import { money } from "../market-format.ts";
import { buildDepositProduct, buildLoanProduct } from "../market-products.ts";
import type {
  LoanProductRules,
  MarketAction,
  MarketWorld,
} from "../market-world.ts";
import type { CoachmarkId } from "../market-ui-state.ts";

type ProductCreationOptions = {
  world: MarketWorld;
  locale: Locale;
  dispatch: React.Dispatch<MarketAction>;
  closeBuilder: () => void;
  completeCoachmark: (id: CoachmarkId) => void;
  setNotice: (message: string) => void;
};

export function useMarketProductCreation({
  world,
  locale,
  dispatch,
  closeBuilder,
  completeCoachmark,
  setNotice,
}: ProductCreationOptions) {
  const m = messagesFor(locale).market;
  const createLoanProduct = useCallback(
    (rules: LoanProductRules) => {
      if (world.cash < world.config.productCreationCost) {
        setNotice(
          m.productInsufficientCash(money(world.config.productCreationCost)),
        );
        return;
      }
      dispatch({
        type: "create-product",
        product: buildLoanProduct(world.products, m.loanProductName, rules),
      });
      completeCoachmark("create-loan-product");
      closeBuilder();
      setNotice(m.productActivated);
    },
    [closeBuilder, completeCoachmark, dispatch, m, setNotice, world],
  );

  const createDepositProduct = useCallback(() => {
    if (world.cash < world.config.productCreationCost) {
      setNotice(
        m.productInsufficientCash(money(world.config.productCreationCost)),
      );
      return;
    }
    dispatch({
      type: "create-product",
      product: buildDepositProduct(world.products, m.depositProductName),
    });
    completeCoachmark("launch-deposit-product");
    closeBuilder();
    setNotice(m.depositProductActivated);
  }, [closeBuilder, completeCoachmark, dispatch, m, setNotice, world]);

  return { createDepositProduct, createLoanProduct };
}
