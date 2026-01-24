import {
  createWebsiteInput,
  updateWebsiteInput,
  websiteIdInput,
  websiteOutput,
  websiteListOutput,
  websiteStatusListOutput,
} from "@repo/validators";
import { protectedProcedure, router } from "../trpc.js";
import { prismaClient } from "@repo/store";
import { TRPCError } from "@trpc/server";
import { getRecentStatusEvents } from "@repo/clickhouse";
import { xAddBulk } from "@repo/streams";

export const websiteRouter = router({
  register: protectedProcedure
    .output(websiteOutput)
    .input(createWebsiteInput)
    .mutation(async (opts) => {
      const { url, name } = opts.input;
      const userId = opts.ctx.user.userId;

      const websiteExists = await prismaClient.website.findFirst({
        where: {
          userId,
          url,
        },
      });

      if (websiteExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "website already registered",
        });
      }

      const website = await prismaClient.website.create({
        data: {
          url,
          name: name ?? null,
          userId,
          isActive: true,
        },
      });

      // Immediate first check: publish website immediately once
      // Then let periodic publisher handle rest
      try {
        await xAddBulk([{ url: website.url, id: website.id }]);
        console.log(
          `[website.register] Published website ${website.id} immediately for first check`,
        );
      } catch (error) {
        // Non-fatal: periodic publisher will pick it up
        console.error(
          `[website.register] Failed to publish website immediately:`,
          error,
        );
      }

      return website;
    }),

  list: protectedProcedure.output(websiteListOutput).query(async (opts) => {
    const userId = opts.ctx.user.userId;

    const websites = await prismaClient.website.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      websites,
      total: websites.length,
    };
  }),

  get: protectedProcedure
    .output(websiteOutput)
    .input(websiteIdInput)
    .query(async (opts) => {
      const { id } = opts.input;
      const userId = opts.ctx.user.userId;

      const website = await prismaClient.website.findFirst({
        where: {
          id,
          userId,
          isActive: true,
        },
      });

      if (!website) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Website not found",
        });
      }

      return website;
    }),

  update: protectedProcedure
    .output(websiteOutput)
    .input(updateWebsiteInput)
    .mutation(async (opts) => {
      const { id, url, name, isActive } = opts.input;
      const userId = opts.ctx.user.userId;

      // First verify the website exists and belongs to the user
      // Note: We check without isActive filter here because we want to allow
      // updating/deleting inactive websites too
      const existingWebsite = await prismaClient.website.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!existingWebsite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Website not found",
        });
      }

      // Build update data object with only provided fields
      const updateData: {
        url?: string;
        name?: string | null;
        isActive?: boolean;
      } = {};

      if (url !== undefined) {
        updateData.url = url;
      }
      if (name !== undefined) {
        updateData.name = name ?? null;
      }
      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }

      const updatedWebsite = await prismaClient.website.update({
        where: { id },
        data: updateData,
      });

      return updatedWebsite;
    }),

  delete: protectedProcedure.input(websiteIdInput).mutation(async (opts) => {
    const { id } = opts.input;
    const userId = opts.ctx.user.userId;

    // First verify the website exists and belongs to the user
    const existingWebsite = await prismaClient.website.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingWebsite) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Website not found",
      });
    }

    // Soft delete: set isActive = false instead of hard delete
    // This prevents race conditions, orphan stream messages, and UI confusion
    await prismaClient.website.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  }),

  status: protectedProcedure
    .output(websiteStatusListOutput)
    .query(async (opts) => {
      const userId = opts.ctx.user.userId;

      // 1. Get websites from Postgres (only active ones)
      const websites = await prismaClient.website.findMany({
        where: {
          userId,
          isActive: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (websites.length === 0) {
        return { websites: [] };
      }

      // Get website IDs
      const websiteIds = websites.map((w) => w.id);

      // 2. Query ClickHouse for recent status events (last 90 checks per website).
      // ClickHouse is the source of truth for status data.
      // If ClickHouse is not configured/available, still return the websites with
      // empty statusPoints so the UI can render the collection.
      let statusEvents: Awaited<ReturnType<typeof getRecentStatusEvents>> = [];
      try {
        statusEvents = await getRecentStatusEvents(websiteIds, 90);
      } catch (error) {
        console.error(
          "[website.status] Failed to fetch status events from ClickHouse",
          error,
        );
      }

      // 3. Group status events by website ID and extract current status
      // Events are already ordered by checked_at DESC from ClickHouse,
      // so the first event per website is the most recent (current status)
      const statusByWebsite = new Map<
        string,
        {
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
        }
      >();

      for (const event of statusEvents) {
        if (!statusByWebsite.has(event.website_id)) {
          // First event for this website is the most recent (current status)
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

      // Build the response
      const websitesWithStatus = websites.map((website) => {
        const statusData = statusByWebsite.get(website.id);
        return {
          websiteId: website.id,
          websiteName: website.name,
          websiteUrl: website.url,
          statusPoints: statusData?.statusPoints || [],
          currentStatus: statusData?.currentStatus || null,
        };
      });

      return { websites: websitesWithStatus };
    }),
});
