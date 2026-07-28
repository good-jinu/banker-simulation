import { MapPin, Newspaper, X } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import type { MarketSegment, MarketWorld } from "./market-world.ts";

type MarketNewsDeskProps = {
  locale: Locale;
  stage: MarketCampaignStage;
  world: MarketWorld;
  onClose: () => void;
  onShowSegment: (segment: MarketSegment) => void;
};

function segmentLabel(segment: MarketSegment, locale: Locale): string {
  const m = messagesFor(locale).market;
  switch (segment) {
    case "workers":
      return m.segmentWorkers;
    case "small-business":
      return m.segmentSmallBusiness;
    case "delivery":
      return m.segmentDelivery;
    case "technology":
      return m.segmentTechnology;
    case "low-credit":
      return m.segmentLowCredit;
  }
}

function severityLabel(
  severity: MarketWorld["news"][number]["severity"],
  locale: Locale,
): string {
  const m = messagesFor(locale).market;
  return severity === "alert"
    ? m.newsAlert
    : severity === "opportunity"
      ? m.newsOpportunity
      : m.newsWatch;
}

export function MarketNewsDesk({
  locale,
  stage,
  world,
  onClose,
  onShowSegment,
}: MarketNewsDeskProps) {
  const m = messagesFor(locale).market;
  const news = [...world.news].reverse();
  return (
    <section
      className="market-news-desk"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-news-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button className="modal-close" onClick={onClose} aria-label={m.close}>
        <X />
      </button>
      <header>
        <span className="market-news-icon" aria-hidden="true">
          <Newspaper />
        </span>
        <div>
          <small>{m.marketWire}</small>
          <h2 id="market-news-title">{m.marketWire}</h2>
        </div>
      </header>
      <div className="market-news-list">
        <article className="market-news-watch">
          <div className="market-news-meta">
            <span>{m.stageBriefingEyebrow(stage.number)}</span>
            <b>{m.newsWatch}</b>
          </div>
          <h3>{localize(stage.title, locale)}</h3>
          <p>{localize(stage.config.copy.introBody, locale)}</p>
          <p className="market-news-action">
            {localize(stage.config.copy.learnCustomerHint, locale)}
          </p>
        </article>
        {news.map((article) => (
          <article
            key={article.id}
            className={`market-news-${article.severity}`}
          >
            <div className="market-news-meta">
              <span>{m.newsDay(article.publishedDay + 1)}</span>
              <b>{severityLabel(article.severity, locale)}</b>
            </div>
            <h3>{localize(article.title, locale)}</h3>
            <p>{localize(article.body, locale)}</p>
            <div className="market-news-tags">
              {article.affectedDistrictIds?.map((districtId) => {
                const district = world.config.map.districts.find(
                  (candidate) => candidate.id === districtId,
                );
                return district ? (
                  <span key={districtId}>
                    <MapPin aria-hidden="true" />
                    {localize(district.name, locale)}
                  </span>
                ) : null;
              })}
              {article.affectedSegments.map((segment) => (
                <span key={segment}>{segmentLabel(segment, locale)}</span>
              ))}
            </div>
            <p className="market-news-action">
              {localize(article.action, locale)}
            </p>
            {article.affectedSegments[0] && (
              <button
                onClick={() => onShowSegment(article.affectedSegments[0]!)}
              >
                <MapPin aria-hidden="true" /> {m.showOnMap}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
