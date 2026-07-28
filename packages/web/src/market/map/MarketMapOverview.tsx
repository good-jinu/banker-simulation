import { AlertTriangle, Layers3, MapPinned } from "lucide-react";
import { localize } from "../../i18n/local-text.ts";
import type { Locale } from "../../i18n/locale.ts";
import { messagesFor } from "../../i18n/messages/index.ts";
import { money } from "../market-format.ts";
import type { MarketSegment } from "../market-segment.ts";
import type { MarketWorld } from "../market-world.ts";
import {
  isProjectedPointVisible,
  projectMapPoint,
  type MapProjection,
} from "./market-camera.ts";
import {
  summarizeMapClusters,
  summarizeMapDistricts,
} from "./market-map-state.ts";

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

export function MarketMapOverview({
  world,
  locale,
  projection,
  lod,
}: {
  world: MarketWorld;
  locale: Locale;
  projection: MapProjection;
  lod: "district" | "cluster";
}) {
  const m = messagesFor(locale).market;
  const map = world.config.map;
  if (lod === "district") {
    return (
      <div className="map-overview-layer" aria-label={m.mapLodDistrict}>
        {summarizeMapDistricts(map, world).map((summary) => {
          const point = projectMapPoint(map, projection, summary.point);
          if (!isProjectedPointVisible(projection, point, 120)) return null;
          return (
            <article
              key={summary.district.id}
              className={`district-summary${summary.alert ? " alert" : ""}${summary.stress > 0 ? " stressed" : ""}`}
              style={{ left: point.x, top: point.y }}
            >
              <span className="district-summary-icon" aria-hidden="true">
                {summary.alert ? <AlertTriangle /> : <MapPinned />}
              </span>
              <strong>{localize(summary.district.name, locale)}</strong>
              <small>
                {m.mapWaitingApplications(summary.waitingApplicants)}
                {" · "}
                {m.mapActiveLoans(summary.acceptedLoans)}
              </small>
              <b>{m.mapLoanExposure(money(summary.outstandingBalance))}</b>
              <em>
                {summary.alert
                  ? m.mapAlert
                  : summary.stress > 0
                    ? m.mapStress(summary.stress)
                    : m.mapStable}
              </em>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="map-overview-layer" aria-label={m.mapLodCluster}>
      {summarizeMapClusters(map, world).map((cluster) => {
        const point = projectMapPoint(map, projection, cluster.point);
        if (!isProjectedPointVisible(projection, point, 88)) return null;
        return (
          <article
            key={cluster.id}
            className={`segment-cluster${cluster.stress > 0 ? " stressed" : ""}`}
            style={{ left: point.x, top: point.y }}
          >
            <Layers3 aria-hidden="true" />
            <strong>{segmentLabel(cluster.segment, locale)}</strong>
            <small>
              {m.mapWaitingApplications(cluster.waitingApplicants)}
              {" · "}
              {m.mapActiveLoans(cluster.acceptedLoans)}
            </small>
            <b>{m.mapLoanExposure(money(cluster.outstandingBalance))}</b>
            {cluster.stress > 0 && <em>{m.mapStress(cluster.stress)}</em>}
          </article>
        );
      })}
    </div>
  );
}
