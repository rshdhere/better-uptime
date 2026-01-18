import {
  createWebsiteInput,
  updateWebsiteInput,
  websiteIdInput,
  websiteOutput,
  websiteListOutput,
} from "@repo/validators";
import { protectedProcedure, router } from "../trpc.js";
import { prismaClient } from "@repo/store";
import { TRPCError } from "@trpc/server";

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

      return website;
    }),

  list: protectedProcedure.output(websiteListOutput).query(async (opts) => {
    const userId = opts.ctx.user.userId;

    const websites = await prismaClient.website.findMany({
      where: {
        userId,
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

    await prismaClient.website.delete({
      where: { id },
    });

    return { success: true };
  }),
});
