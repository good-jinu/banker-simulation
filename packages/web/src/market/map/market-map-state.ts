import type { MarketNews } from "../market-news.ts";
import { hasMarketAlertForDistrict } from "../market-news.ts";
import type { MarketSegment } from "../market-segment.ts";
import type { MarketStressState } from "../market-stress.ts";
import type { Customer, Depositor, Funding, Product } from "../market-world.ts";
import {
  isProjectedPointVisible,
  projectMapPoint,
  type MapProjection,
} from "./market-camera.ts";
import {
  marketPoint,
  type MapPoint,
  type MarketDistrict,
  type MarketMapDefinition,
} from "./market-map.ts";

export type MarketMapPortfolio = {
  customers: readonly Customer[];
  depositors: readonly Depositor[];
  funding: readonly Funding[];
  products: readonly Product[];
  news: readonly MarketNews[];
  stress: MarketStressState;
};

export type MarketDistrictSummary = {
  district: MarketDistrict;
  point: MapPoint;
  waitingApplicants: number;
  acceptedLoans: number;
  outstandingBalance: number;
  depositBalance: number;
  stress: number;
  alert: boolean;
};

export type MarketSegmentCluster = {
  id: string;
  districtId: string;
  segment: MarketSegment;
  point: MapPoint;
  waitingApplicants: number;
  acceptedLoans: number;
  outstandingBalance: number;
  stress: number;
};

export function summarizeMapDistricts(
  map: MarketMapDefinition,
  portfolio: MarketMapPortfolio,
): MarketDistrictSummary[] {
  return map.districts.map((district) => {
    const customers = portfolio.customers.filter(
      (customer) => customer.districtId === district.id,
    );
    const depositors = portfolio.depositors.filter(
      (depositor) =>
        depositor.districtId === district.id && depositor.status === "accepted",
    );
    return {
      district,
      point: district.center,
      waitingApplicants: customers.filter(
        (customer) => customer.status === "waiting",
      ).length,
      acceptedLoans: customers.filter(
        (customer) => customer.status === "accepted",
      ).length,
      outstandingBalance: customers
        .filter((customer) => customer.status === "accepted")
        .reduce((total, customer) => total + customer.amount, 0),
      depositBalance: depositors.reduce(
        (total, depositor) => total + depositor.balance,
        0,
      ),
      stress: portfolio.stress.districts[district.id]?.value ?? 0,
      alert: hasMarketAlertForDistrict(portfolio.news, district.id),
    };
  });
}

export function summarizeMapClusters(
  map: MarketMapDefinition,
  portfolio: MarketMapPortfolio,
): MarketSegmentCluster[] {
  const clusters: MarketSegmentCluster[] = [];
  for (const district of map.districts) {
    for (const segment of district.segments) {
      const customers = portfolio.customers.filter(
        (customer) =>
          customer.districtId === district.id && customer.segment === segment,
      );
      if (customers.length === 0) continue;
      const points = customers.map((customer) =>
        marketPoint(map, customer.locationId),
      );
      clusters.push({
        id: `${district.id}-${segment}`,
        districtId: district.id,
        segment,
        point: {
          x:
            points.reduce((total, point) => total + point.x, 0) / points.length,
          y:
            points.reduce((total, point) => total + point.y, 0) / points.length,
        },
        waitingApplicants: customers.filter(
          (customer) => customer.status === "waiting",
        ).length,
        acceptedLoans: customers.filter(
          (customer) => customer.status === "accepted",
        ).length,
        outstandingBalance: customers
          .filter((customer) => customer.status === "accepted")
          .reduce((total, customer) => total + customer.amount, 0),
        stress: portfolio.stress.segments[segment]?.value ?? 0,
      });
    }
  }
  return clusters;
}

export function selectDetailedMapCustomers(
  map: MarketMapDefinition,
  projection: MapProjection,
  customers: readonly Customer[],
  options: {
    limit: number;
    highlightedSegment: MarketSegment | null;
    recentCustomerIds: ReadonlySet<string>;
  },
): Customer[] {
  return customers
    .filter((customer) => !customer.productId)
    .filter((customer) =>
      isProjectedPointVisible(
        projection,
        projectMapPoint(map, projection, marketPoint(map, customer.locationId)),
        78,
      ),
    )
    .sort((first, second) => {
      const firstPriority =
        (first.status === "waiting" ? 4 : 0) +
        (first.segment === options.highlightedSegment ? 2 : 0) +
        (options.recentCustomerIds.has(first.id) ? 1 : 0);
      const secondPriority =
        (second.status === "waiting" ? 4 : 0) +
        (second.segment === options.highlightedSegment ? 2 : 0) +
        (options.recentCustomerIds.has(second.id) ? 1 : 0);
      return (
        secondPriority - firstPriority || first.id.localeCompare(second.id)
      );
    })
    .slice(0, Math.max(0, options.limit));
}
