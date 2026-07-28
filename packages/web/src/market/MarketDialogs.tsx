import { X } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CustomerConsultation } from "./CustomerConsultation.tsx";
import type {
  ConsultationAnswers,
  ConsultationProgress,
  ConsultationQuestionId,
} from "./market-consultation.ts";
import type { MarketOverlay } from "./market-overlay.ts";
import { DepositProductBuilder } from "./DepositProductBuilder.tsx";
import { InterbankConversation } from "./InterbankConversation.tsx";
import { ProductBuilder } from "./ProductBuilder.tsx";
import { ProductDetails } from "./ProductDetails.tsx";
import { MarketNewsDesk } from "./MarketNewsDesk.tsx";
import { MarketResultReport } from "./MarketResultReport.tsx";
import { MarketAssetsDialog } from "./MarketAssetsDialog.tsx";
import type { MarketCampaignStage } from "./market-campaign.ts";
import {
  type Customer,
  type Funding,
  type LoanProductRules,
  type MarketSegment,
  type MarketWorld,
} from "./market-world.ts";

type MarketDialogsProps = {
  stage: MarketCampaignStage;
  locale: Locale;
  world: MarketWorld;
  overlay: MarketOverlay | null;
  consultation: ConsultationProgress;
  onCloseOverlay: () => void;
  onConsultationProgress: (answers: ConsultationAnswers) => void;
  onConsultationQuestionAsked: (question: ConsultationQuestionId) => void;
  onApprove: (customer: Customer) => void;
  onReject: (customer: Customer) => void;
  onNeedFunding: () => void;
  onCreateProduct: (rules: LoanProductRules) => void;
  onCreateDepositProduct: () => void;
  onToggleProduct: (productId: string, active: boolean) => void;
  onShowNewsSegment: (segment: MarketSegment) => void;
  onBorrow: (lender: Funding) => void;
  onComplete: () => void;
  onBack: () => void;
};

export function MarketDialogs({
  stage,
  locale,
  world,
  overlay,
  consultation,
  onCloseOverlay,
  onConsultationProgress,
  onConsultationQuestionAsked,
  onApprove,
  onReject,
  onNeedFunding,
  onCreateProduct,
  onCreateDepositProduct,
  onToggleProduct,
  onShowNewsSegment,
  onBorrow,
  onComplete,
  onBack,
}: MarketDialogsProps) {
  const m = messagesFor(locale).market;
  const { cash, funding } = world;
  const selected =
    overlay?.kind === "customer"
      ? (world.customers.find(
          (customer) => customer.id === overlay.customerId,
        ) ?? null)
      : null;
  const selectedProduct =
    overlay?.kind !== "product"
      ? null
      : (world.products.find((product) => product.id === overlay.productId) ??
        null);
  const selectedProductCustomers =
    selectedProduct?.kind === "loan"
      ? world.customers.filter(
          (customer) => customer.productId === selectedProduct.id,
        )
      : [];
  const selectedProductDepositors =
    selectedProduct?.kind === "deposit"
      ? world.depositors.filter(
          (depositor) => depositor.productId === selectedProduct.id,
        )
      : [];

  return (
    <>
      {world.missionCleared && (
        <div
          className="mission-clear-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-clear-title"
        >
          <div className="money-confetti" aria-hidden="true">
            {Array.from({ length: 30 }, (_, index) => (
              <i
                key={index}
                style={
                  {
                    "--x": `${(index * 37 + 9) % 100}%`,
                    "--delay": `${(index % 10) * 0.09}s`,
                    "--drift": `${(index % 2 === 0 ? 1 : -1) * (18 + (index % 5) * 9)}px`,
                  } as React.CSSProperties
                }
              >
                {index % 3 === 0 ? "$100" : "$"}
              </i>
            ))}
          </div>
          <MarketResultReport
            stage={stage}
            locale={locale}
            world={world}
            won
            onContinue={onComplete}
          />
        </div>
      )}
      {overlay?.kind === "assets" && (
        <MarketAssetsDialog
          world={world}
          locale={locale}
          onClose={onCloseOverlay}
        />
      )}
      {selected && (
        <div className="modal-backdrop" onMouseDown={onCloseOverlay}>
          <section
            className="consultation-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={onCloseOverlay}
              aria-label={m.close}
            >
              <X />
            </button>
            <CustomerConsultation
              key={selected.id}
              customer={selected}
              locale={locale}
              showRiskEstimate={world.config.randomizeDefaultRisk}
              showCreditScore={world.products.some(
                (product) =>
                  product.kind === "loan" &&
                  product.modules?.includes("credit-check"),
              )}
              learnCustomerHint={localize(
                stage.config.copy.learnCustomerHint,
                locale,
              )}
              mode="request"
              sceneLabel={m.loanRequestTitle}
              onApprove={() => onApprove(selected)}
              onReject={() => onReject(selected)}
              {...(world.onboarding === "full" ? { onNeedFunding } : {})}
              canApprove={cash >= selected.amount}
              requireQuestionsBeforeDecision={
                (world.onboarding === "first-customer" &&
                  selected.id === world.config.introCustomerId) ||
                world.onboarding === "second-decision"
              }
              forceApproval={
                world.onboarding === "first-customer" &&
                selected.id === world.config.introCustomerId
              }
              // Only this customer's own answers seed the dialog; anyone
              // else's are a different conversation.
              {...(consultation.customerId === selected.id
                ? { initialProgress: consultation }
                : {})}
              onProgressChange={onConsultationProgress}
              onQuestionAsked={onConsultationQuestionAsked}
            />
          </section>
        </div>
      )}
      {selectedProduct && (
        <div className="modal-backdrop" onMouseDown={onCloseOverlay}>
          <ProductDetails
            locale={locale}
            product={selectedProduct}
            day={world.day}
            customers={selectedProductCustomers}
            depositors={selectedProductDepositors}
            onClose={onCloseOverlay}
            onToggleActive={onToggleProduct}
          />
        </div>
      )}
      {overlay?.kind === "product-builder" &&
        overlay.productKind === "loan" && (
          <div className="modal-backdrop">
            <ProductBuilder
              locale={locale}
              creationCost={world.config.productCreationCost}
              onCreate={onCreateProduct}
              onClose={onCloseOverlay}
            />
          </div>
        )}
      {overlay?.kind === "product-builder" &&
        overlay.productKind === "deposit" && (
          <div className="modal-backdrop">
            <DepositProductBuilder
              locale={locale}
              creationCost={world.config.productCreationCost}
              interestRate={2}
              onCreate={onCreateDepositProduct}
              onClose={onCloseOverlay}
            />
          </div>
        )}
      {overlay?.kind === "funding" && (
        <div className="modal-backdrop" onMouseDown={onCloseOverlay}>
          <section
            className="funding-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={onCloseOverlay}
              aria-label={m.close}
            >
              <X />
            </button>
            <InterbankConversation
              funding={funding}
              locale={locale}
              onBorrow={onBorrow}
            />
          </section>
        </div>
      )}
      {overlay?.kind === "news" && (
        <div className="modal-backdrop" onMouseDown={onCloseOverlay}>
          <MarketNewsDesk
            locale={locale}
            stage={stage}
            world={world}
            onClose={onCloseOverlay}
            onShowSegment={onShowNewsSegment}
          />
        </div>
      )}
      {world.runFailed && (
        <div
          className="mission-clear-backdrop loss-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="loss-title"
        >
          <MarketResultReport
            stage={stage}
            locale={locale}
            world={world}
            won={false}
            onContinue={onBack}
          />
        </div>
      )}
    </>
  );
}
