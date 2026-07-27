import { useEffect, useRef, useState } from "react";
import { localize } from "../../i18n/local-text.ts";
import type { Locale } from "../../i18n/locale.ts";
import { messagesFor } from "../../i18n/messages/index.ts";
import { money } from "../market-format.ts";
import {
  flowForEvent,
  pointForId,
  type FlowAnimation,
  type FlowLabels,
} from "../market-flow.ts";
import type { Customer, MarketWorld } from "../market-world.ts";

type UseMarketEffectsOptions = {
  world: MarketWorld;
  locale: Locale;
  onOpenProductBuilder: () => void;
  onOpenFunding: () => void;
};

export function useMarketEffects({
  world,
  locale,
  onOpenProductBuilder,
  onOpenFunding,
}: UseMarketEffectsOptions) {
  const m = messagesFor(locale).market;
  const [notice, setNotice] = useState<string | null>(null);
  const [loanRequestNotice, setLoanRequestNotice] = useState<Customer | null>(
    null,
  );
  const [flowQueue, setFlowQueue] = useState<FlowAnimation[]>([]);
  const [activeFlow, setActiveFlow] = useState<FlowAnimation | null>(null);
  const [trustPulse, setTrustPulse] = useState<"up" | "down" | null>(null);
  const flowId = useRef(0);

  useEffect(() => {
    for (const event of world.events) {
      switch (event.type) {
        case "repayment":
          setNotice(m.noticeRepayment(money(event.amount)));
          break;
        case "default":
          setNotice(
            m.noticeDefault(
              localize(event.customer.name, locale),
              money(event.customer.amount),
            ),
          );
          if (!world.products.some((product) => product.kind === "loan"))
            onOpenProductBuilder();
          break;
        case "customer-repayment":
          setNotice(
            m.noticeCustomerRepayment(
              localize(event.customer.name, locale),
              money(event.amount),
            ),
          );
          break;
        case "loan-request":
          setLoanRequestNotice(event.customer);
          break;
        case "deposit-accepted":
          setNotice(
            m.noticeDepositAccepted(
              localize(event.depositor.name, locale),
              money(event.depositor.amount),
            ),
          );
          break;
        case "deposit-withdrawal":
          setNotice(m.noticeDepositWithdrawal(money(event.amount)));
          break;
        case "borrowed":
          setNotice(
            m.borrowed(
              localize(event.lender.name, locale),
              money(event.lender.amount),
            ),
          );
          break;
        case "funding-repayment":
          setNotice(
            m.noticeFundingRepayment(
              localize(event.lender.name, locale),
              money(event.amount),
            ),
          );
          break;
        case "funding-default":
          setNotice(
            m.noticeFundingDefault(
              localize(event.lender.name, locale),
              money(event.amount),
            ),
          );
          break;
        case "funding-settlement":
          setNotice(
            m.noticeFundingSettlement(
              localize(event.lender.name, locale),
              money(event.amount),
            ),
          );
          break;
        case "funding-unlocked":
          onOpenFunding();
          setNotice(m.fundingArrived);
          break;
        case "trust-shift":
          setTrustPulse(event.direction);
          break;
        case "insolvent":
          setNotice(
            world.failureReason === "trust"
              ? m.trustFailureTitle
              : m.noticeInsolvent,
          );
          break;
        default:
          break;
      }
    }
  }, [
    locale,
    m,
    onOpenFunding,
    onOpenProductBuilder,
    world.events,
    world.failureReason,
    world.products,
  ]);

  useEffect(() => {
    const pointFor = (id: string) =>
      pointForId(
        id,
        world.customers,
        world.depositors,
        world.funding,
        world.products,
      );
    const labels: FlowLabels = {
      funded: m.flowFunded,
      cashIn: m.flowCashIn,
      repaid: m.flowRepaid,
      paid: m.flowPaid,
      settled: m.flowSettled,
      defaulted: m.flowDefaulted,
      automated: m.flowAutomated,
      retrieved: m.flowRetrieved,
    };
    const flows = world.events
      .map((event) => flowForEvent(event, pointFor, labels))
      .filter((flow): flow is Omit<FlowAnimation, "id"> => flow !== null)
      .map((flow) => ({ ...flow, id: ++flowId.current }));
    if (flows.length > 0) setFlowQueue((pending) => [...pending, ...flows]);
  }, [
    m,
    world.events,
    world.funding,
    world.customers,
    world.depositors,
    world.products,
  ]);

  useEffect(() => {
    if (activeFlow || flowQueue.length === 0) return;
    const [next, ...rest] = flowQueue;
    setFlowQueue(rest);
    setActiveFlow(next ?? null);
  }, [activeFlow, flowQueue]);

  useEffect(() => {
    if (!activeFlow) return;
    const handle = window.setTimeout(
      () => setActiveFlow(null),
      activeFlow.kind === "default" ? 1_250 : 1_100,
    );
    return () => window.clearTimeout(handle);
  }, [activeFlow]);

  useEffect(() => {
    if (!trustPulse) return;
    const handle = window.setTimeout(() => setTrustPulse(null), 900);
    return () => window.clearTimeout(handle);
  }, [trustPulse]);

  useEffect(() => {
    if (!notice) return;
    const handle = window.setTimeout(() => setNotice(null), 3_200);
    return () => window.clearTimeout(handle);
  }, [notice]);

  useEffect(() => {
    if (!loanRequestNotice) return;
    const handle = window.setTimeout(() => setLoanRequestNotice(null), 3_200);
    return () => window.clearTimeout(handle);
  }, [loanRequestNotice]);

  return {
    activeFlow,
    loanRequestNotice,
    notice,
    setNotice,
    trustPulse,
  };
}
