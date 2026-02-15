import { TRPCError } from "@trpc/server";
import { prismaClient } from "@repo/store";
import {
  createStatusPageInput,
  publicStatusPageByHostInput,
  statusPageListOutput,
  statusPageOutput,
  statusPagePublicOutput,
  updateStatusPageInput,
} from "@repo/validators";
import {
  getRecentStatusEvents,
  getStatusEventsForLookbackHours,
} from "@repo/clickhouse";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

const STATUS_EVENT_QUERY_CONFIG = {
  PER_CHECK_LIMIT: 90,
  PER_DAY_LOOKBACK_DAYS: 31,
} as const;

type WebsiteStatusEvent = {
  website_id: string;
  region_id: string;
  status: "UP" | "DOWN";
  checked_at: string;
  response_time_ms: number | null;
  http_status_code: number | null;
};

type WebsiteStatusSummary = {
  websiteId: string;
  websiteName: string | null;
  websiteUrl: string;
  statusPoints: Array<{
    status: "UP" | "DOWN";
    checkedAt: Date;
    responseTimeMs: number | null;
    httpStatusCode: number | null;
  }>;
  currentStatus: {
    status: "UP" | "DOWN";
    checkedAt: Date;
    responseTimeMs: number | null;
    httpStatusCode: number | null;
    regionId: string;
  } | null;
};

async function getStatusEventsByWebsiteIds(
  websiteIds: string[],
  viewMode: "per-check" | "per-day",
): Promise<WebsiteStatusEvent[]> {
  if (websiteIds.length === 0) {
    return [];
  }

  try {
    if (viewMode === "per-day") {
      return await getStatusEventsForLookbackHours(
        websiteIds,
        STATUS_EVENT_QUERY_CONFIG.PER_DAY_LOOKBACK_DAYS * 24,
      );
    }
    return await getRecentStatusEvents(
      websiteIds,
      STATUS_EVENT_QUERY_CONFIG.PER_CHECK_LIMIT,
    );
  } catch (error) {
    console.error(
      "[statusPage] Failed to fetch status events from ClickHouse",
      {
        error,
      },
    );
    return [];
  }
}

function mapWebsiteStatuses(
  websites: Array<{
    id: string;
    name: string | null;
    url: string;
  }>,
  statusEvents: WebsiteStatusEvent[],
): WebsiteStatusSummary[] {
  const statusByWebsite = new Map<
    string,
    {
      statusPoints: WebsiteStatusSummary[number]["statusPoints"];
      currentStatus: WebsiteStatusSummary[number]["currentStatus"];
    }
  >();

  for (const event of statusEvents) {
    if (!statusByWebsite.has(event.website_id)) {
      statusByWebsite.set(event.website_id, {
        statusPoints: [],
        currentStatus: {
          status: event.status,
          checkedAt: new Date(event.checked_at),
          responseTimeMs: event.response_time_ms,
          httpStatusCode: event.http_status_code,
          regionId: event.region_id,
        },
      });
    }

    statusByWebsite.get(event.website_id)!.statusPoints.push({
      status: event.status,
      checkedAt: new Date(event.checked_at),
      responseTimeMs: event.response_time_ms,
      httpStatusCode: event.http_status_code,
    });
  }

  return websites.map((website) => {
    const statusData = statusByWebsite.get(website.id);
    return {
      websiteId: website.id,
      websiteName: website.name,
      websiteUrl: website.url,
      statusPoints: statusData?.statusPoints || [],
      currentStatus: statusData?.currentStatus || null,
    };
  });
}

function toStatusPageOutput(statusPage: {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  monitors: Array<{ websiteId: string }>;
  domain: {
    id: string;
    hostname: string;
    verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}) {
  return {
    id: statusPage.id,
    name: statusPage.name,
    slug: statusPage.slug,
    isPublished: statusPage.isPublished,
    userId: statusPage.userId,
    monitorCount: statusPage.monitors.length,
    domain: statusPage.domain,
    createdAt: statusPage.createdAt,
    updatedAt: statusPage.updatedAt,
  };
}

export const statusPageRouter = router({
  create: protectedProcedure
    .input(createStatusPageInput)
    .output(statusPageOutput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.userId;
      const { name, slug, monitorIds, isPublished } = input;

      const websites = await prismaClient.website.findMany({
        where: {
          id: {
            in: monitorIds,
          },
          userId,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (websites.length !== monitorIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more selected monitors are invalid",
        });
      }

      try {
        const statusPage = await prismaClient.statusPage.create({
          data: {
            name,
            slug,
            userId,
            isPublished: isPublished ?? true,
            monitors: {
              createMany: {
                data: monitorIds.map((websiteId) => ({
                  websiteId,
                })),
              },
            },
          },
          include: {
            monitors: {
              select: { websiteId: true },
            },
            domain: true,
          },
        });

        return toStatusPageOutput(statusPage);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slug already exists",
          });
        }
        throw error;
      }
    }),

  update: protectedProcedure
    .input(updateStatusPageInput)
    .output(statusPageOutput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.userId;
      const { id, monitorIds, ...updates } = input;

      const existingStatusPage = await prismaClient.statusPage.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          monitors: { select: { websiteId: true } },
          domain: true,
        },
      });

      if (!existingStatusPage) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Status page not found",
        });
      }

      if (monitorIds) {
        const websites = await prismaClient.website.findMany({
          where: {
            id: { in: monitorIds },
            userId,
            isActive: true,
          },
          select: {
            id: true,
          },
        });

        if (websites.length !== monitorIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more selected monitors are invalid",
          });
        }
      }

      try {
        const updated = await prismaClient.$transaction(async (tx) => {
          const updatedStatusPage = await tx.statusPage.update({
            where: { id },
            data: updates,
          });

          if (monitorIds) {
            await tx.statusPageMonitor.deleteMany({
              where: { statusPageId: id },
            });
            await tx.statusPageMonitor.createMany({
              data: monitorIds.map((websiteId) => ({
                statusPageId: id,
                websiteId,
              })),
            });
          }

          return tx.statusPage.findUniqueOrThrow({
            where: { id: updatedStatusPage.id },
            include: {
              monitors: { select: { websiteId: true } },
              domain: true,
            },
          });
        });

        return toStatusPageOutput(updated);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slug already exists",
          });
        }
        throw error;
      }
    }),

  list: protectedProcedure
    .output(statusPageListOutput)
    .query(async ({ ctx }) => {
      const statusPages = await prismaClient.statusPage.findMany({
        where: {
          userId: ctx.user.userId,
        },
        include: {
          monitors: {
            select: { websiteId: true },
          },
          domain: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return {
        statusPages: statusPages.map(toStatusPageOutput),
      };
    }),

  publicByHost: publicProcedure
    .input(publicStatusPageByHostInput)
    .output(statusPagePublicOutput)
    .query(async ({ input }) => {
      const { hostname, viewMode } = input;

      const domain = await prismaClient.statusPageDomain.findFirst({
        where: {
          hostname,
          verificationStatus: "VERIFIED",
          statusPage: {
            isPublished: true,
          },
        },
        include: {
          statusPage: {
            include: {
              monitors: {
                include: {
                  website: true,
                },
              },
            },
          },
        },
      });

      if (!domain) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Status page not found for this hostname",
        });
      }

      const activeWebsites = domain.statusPage.monitors
        .map((monitor) => monitor.website)
        .filter((website) => website.isActive);

      const websiteIds = activeWebsites.map((website) => website.id);
      const statusEvents = await getStatusEventsByWebsiteIds(
        websiteIds,
        viewMode,
      );
      const websites = mapWebsiteStatuses(
        activeWebsites.map((website) => ({
          id: website.id,
          name: website.name,
          url: website.url,
        })),
        statusEvents,
      );

      return {
        statusPage: {
          id: domain.statusPage.id,
          name: domain.statusPage.name,
          slug: domain.statusPage.slug,
          hostname: domain.hostname,
          websites,
        },
      };
    }),
});
