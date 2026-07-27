import { Coins, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import type { LoanProductRules, OccupationRule } from "./market-world.ts";

type ProductBuilderProps = {
  locale: Locale;
  creationCost: number;
  onCreate: (rules: LoanProductRules) => void;
  onClose: () => void;
};

export function ProductBuilder({
  locale,
  creationCost,
  onCreate,
  onClose,
}: ProductBuilderProps) {
  const m = messagesFor(locale).market;
  const [rules, setRules] = useState<LoanProductRules>({
    minimumIncome: 1_500,
    occupation: "employed",
    interestRate: 10,
    minimumAmount: 300,
    maximumAmount: 1_000,
    minimumTerm: 6,
    maximumTerm: 12,
  });
  const setNumber =
    (key: Exclude<keyof LoanProductRules, "occupation">) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setRules((current) => ({
        ...current,
        [key]: Number(event.target.value),
      }));
  const setRange =
    (range: "amount" | "term", boundary: "minimum" | "maximum") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setRules((current) => {
        const minimumKey = range === "amount" ? "minimumAmount" : "minimumTerm";
        const maximumKey = range === "amount" ? "maximumAmount" : "maximumTerm";
        return {
          ...current,
          [minimumKey]:
            boundary === "minimum"
              ? Math.min(value, current[maximumKey])
              : current[minimumKey],
          [maximumKey]:
            boundary === "maximum"
              ? Math.max(value, current[minimumKey])
              : current[maximumKey],
        };
      });
    };
  const rangeStyle = (minimum: number, maximum: number, ceiling: number) =>
    ({
      "--range-start": `${(minimum / ceiling) * 100}%`,
      "--range-end": `${(maximum / ceiling) * 100}%`,
    }) as React.CSSProperties;

  return (
    <section className="product-builder" role="dialog" aria-modal="true">
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <span className="product-builder-icon">
        <SlidersHorizontal aria-hidden="true" />
      </span>
      <small>{m.productLessonEyebrow}</small>
      <h2>{m.productBuilderTitle}</h2>
      <p>{m.productBuilderCopy}</p>
      <div className="product-cost">
        <Coins aria-hidden="true" />
        <span>{m.productSetupCost(money(creationCost))}</span>
      </div>
      <div className="product-rule-grid">
        <label>
          <span>{m.productMinimumIncome}</span>
          <input
            type="number"
            min="0"
            step="100"
            value={rules.minimumIncome}
            onChange={setNumber("minimumIncome")}
          />
        </label>
        <label>
          <span>{m.productOccupation}</span>
          <select
            value={rules.occupation}
            onChange={(event) =>
              setRules((current) => ({
                ...current,
                occupation: event.target.value as OccupationRule,
              }))
            }
          >
            <option value="any">{m.productOccupationAny}</option>
            <option value="employed">{m.productOccupationEmployed}</option>
            <option value="self-employed">
              {m.productOccupationSelfEmployed}
            </option>
          </select>
        </label>
        <label>
          <span>{m.productInterestRate}</span>
          <input
            type="number"
            min="1"
            max="30"
            step="1"
            value={rules.interestRate}
            onChange={setNumber("interestRate")}
          />
        </label>
        <label>
          <span>{m.productLoanRange}</span>
          <div
            className="product-range-slider"
            style={rangeStyle(rules.minimumAmount, rules.maximumAmount, 2_500)}
          >
            <input
              className="range-thumb range-minimum"
              type="range"
              min="0"
              max="2500"
              step="100"
              value={rules.minimumAmount}
              onChange={setRange("amount", "minimum")}
              aria-label={m.rangeMinimum(m.productLoanRange)}
            />
            <input
              className="range-thumb range-maximum"
              type="range"
              min="0"
              max="2500"
              step="100"
              value={rules.maximumAmount}
              onChange={setRange("amount", "maximum")}
              aria-label={m.rangeMaximum(m.productLoanRange)}
            />
            <output>
              {money(rules.minimumAmount)} – {money(rules.maximumAmount)}
            </output>
          </div>
        </label>
        <label>
          <span>{m.productDueRange}</span>
          <div
            className="product-range-slider"
            style={rangeStyle(rules.minimumTerm, rules.maximumTerm, 20)}
          >
            <input
              className="range-thumb range-minimum"
              type="range"
              min="1"
              max="20"
              value={rules.minimumTerm}
              onChange={setRange("term", "minimum")}
              aria-label={m.rangeMinimum(m.productDueRange)}
            />
            <input
              className="range-thumb range-maximum"
              type="range"
              min="1"
              max="20"
              value={rules.maximumTerm}
              onChange={setRange("term", "maximum")}
              aria-label={m.rangeMaximum(m.productDueRange)}
            />
            <output>
              {m.rangeDays(rules.minimumTerm)} –{" "}
              {m.rangeDays(rules.maximumTerm)}
            </output>
          </div>
        </label>
      </div>
      <div className="product-preview">
        <strong>{m.productPreview}</strong>
        <span>
          {m.productRuleSummary(
            money(rules.minimumIncome),
            money(rules.minimumAmount),
            money(rules.maximumAmount),
          )}
        </span>
      </div>
      <button className="create-product-button" onClick={() => onCreate(rules)}>
        <SlidersHorizontal /> {m.createLoanProduct(money(creationCost))}
      </button>
    </section>
  );
}
