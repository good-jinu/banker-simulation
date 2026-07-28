import { describe, expect, it } from "vitest";
import { supportedLocales } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { loanModuleCopy, loanModuleLabel } from "./market-modules.ts";
import { LOAN_PRODUCT_MODULES } from "./market-product-types.ts";

describe("loan module copy", () => {
  it("names and explains every module in every locale", () => {
    for (const locale of supportedLocales) {
      const m = messagesFor(locale).market;
      const labels = LOAN_PRODUCT_MODULES.map((module) =>
        loanModuleLabel(m, module),
      );

      expect(new Set(labels).size).toBe(LOAN_PRODUCT_MODULES.length);
      for (const module of LOAN_PRODUCT_MODULES) {
        expect(loanModuleLabel(m, module).length).toBeGreaterThan(0);
        expect(loanModuleCopy(m, module).length).toBeGreaterThan(0);
      }
    }
  });
});
