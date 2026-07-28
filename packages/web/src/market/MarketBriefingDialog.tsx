import { X } from "lucide-react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";

type MarketBriefingDialogProps = {
  locale: Locale;
  image: string;
  eyebrow: string;
  title: string;
  body: string;
  onClose: () => void;
};

/**
 * The one dialog that stops the world: image, title, body, dismiss. Both the
 * stage opening and every published article use it, so an interruption always
 * looks and behaves the same way.
 */
export function MarketBriefingDialog({
  locale,
  image,
  eyebrow,
  title,
  body,
  onClose,
}: MarketBriefingDialogProps) {
  const m = messagesFor(locale).market;
  return (
    <section
      className="market-briefing"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-briefing-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <div className="market-briefing-art">
        <img src={image} alt="" aria-hidden="true" />
      </div>
      <p className="market-briefing-eyebrow">{eyebrow}</p>
      <h2 id="market-briefing-title">{title}</h2>
      <p className="market-briefing-body">{body}</p>
      <button className="market-briefing-dismiss" onClick={onClose}>
        {m.briefingDismiss}
      </button>
    </section>
  );
}
