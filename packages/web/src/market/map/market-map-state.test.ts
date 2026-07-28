import { describe, expect, it } from "vitest";
import { METRO_REGION_MAP } from "./market-map-data.ts";
import {
  selectDetailedMapCustomers,
  summarizeMapClusters,
  summarizeMapDistricts,
} from "./market-map-state.ts";
import { createWorld } from "../market-world.ts";

describe("market map aggregation", () => {
  it("separates district exposure from the individual contract list", () => {
    const world = createWorld(3, "portfolio-crossroads");
    const customer = world.customers[0]!;
    const portfolio = {
      ...world,
      customers: [
        { ...customer, status: "accepted" as const },
        {
          ...customer,
          id: "second",
          status: "waiting" as const,
          amount: 900,
        },
      ],
    };
    const summary = summarizeMapDistricts(METRO_REGION_MAP, portfolio).find(
      (district) => district.district.id === customer.districtId,
    );

    expect(summary).toMatchObject({
      acceptedLoans: 1,
      waitingApplicants: 1,
      outstandingBalance: customer.amount,
    });
  });

  it("groups contracts by both region and industry", () => {
    const world = createWorld(3, "portfolio-crossroads");
    const cluster = summarizeMapClusters(METRO_REGION_MAP, world).find(
      (candidate) => candidate.segment === "small-business",
    );

    expect(cluster?.districtId).toBe("old-market");
    expect(cluster?.waitingApplicants).toBe(1);
  });

  it("keeps the detail DOM budget with a 1,000-customer stress fixture", () => {
    const world = createWorld(3, "portfolio-crossroads");
    const template = world.customers[0]!;
    const customers = Array.from({ length: 1_000 }, (_, index) => ({
      ...template,
      id: `stress-${index}`,
      locationId:
        METRO_REGION_MAP.lots[index % METRO_REGION_MAP.lots.length]!.id,
      districtId:
        METRO_REGION_MAP.lots[index % METRO_REGION_MAP.lots.length]!.districtId,
    }));
    const selected = selectDetailedMapCustomers(
      METRO_REGION_MAP,
      {
        camera: {
          center: { ...METRO_REGION_MAP.camera.initialCenter },
          zoom: METRO_REGION_MAP.camera.maxZoom,
        },
        viewport: { width: 1_440, height: 900 },
      },
      customers,
      {
        limit: METRO_REGION_MAP.detailedNodeLimit.desktop,
        highlightedSegment: null,
        recentCustomerIds: new Set(),
      },
    );

    expect(selected).toHaveLength(24);
  });
});
