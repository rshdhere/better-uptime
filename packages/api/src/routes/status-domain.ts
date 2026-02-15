import { resolveCname, resolveTxt } from "node:dns/promises";
import { TRPCError } from "@trpc/server";
import { prismaClient } from "@repo/store";
import {
  canIssueTlsInput,
  canIssueTlsOutput,
  requestStatusDomainVerificationInput,
  requestStatusDomainVerificationOutput,
  verifyStatusDomainInput,
  verifyStatusDomainOutput,
} from "@repo/validators";
import {
  STATUS_PAGE_CNAME_TARGET,
  STATUS_PAGE_VERIFY_TXT_PREFIX,
} from "@repo/config/constants";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

function normalizeDnsValue(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function getDnsRecords(hostname: string, verificationToken: string) {
  return {
    cnameRecordName: hostname,
    cnameRecordValue: STATUS_PAGE_CNAME_TARGET,
    txtRecordName: `${STATUS_PAGE_VERIFY_TXT_PREFIX}.${hostname}`,
    txtRecordValue: verificationToken,
  };
}

async function resolveTxtValues(hostname: string): Promise<string[]> {
  try {
    const records = await resolveTxt(hostname);
    return records.flat().map((value) => value.trim());
  } catch (error) {
    // DNS propagation and missing records should be treated as non-fatal.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENODATA" ||
        error.code === "ENOTFOUND" ||
        error.code === "EAI_AGAIN" ||
        error.code === "SERVFAIL")
    ) {
      return [];
    }
    throw error;
  }
}

async function resolveCnameValues(hostname: string): Promise<string[]> {
  try {
    const records = await resolveCname(hostname);
    return records.map((value) => normalizeDnsValue(value));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENODATA" ||
        error.code === "ENOTFOUND" ||
        error.code === "EAI_AGAIN" ||
        error.code === "SERVFAIL")
    ) {
      return [];
    }
    throw error;
  }
}

function createVerificationToken(): string {
  return `uptique-${crypto.randomUUID().replace(/-/g, "")}`;
}

export const statusDomainRouter = router({
  requestVerification: protectedProcedure
    .input(requestStatusDomainVerificationInput)
    .output(requestStatusDomainVerificationOutput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.userId;
      const { statusPageId, hostname } = input;

      const statusPage = await prismaClient.statusPage.findFirst({
        where: {
          id: statusPageId,
          userId,
        },
      });

      if (!statusPage) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Status page not found",
        });
      }

      const existingHostname = await prismaClient.statusPageDomain.findUnique({
        where: {
          hostname,
        },
      });

      if (existingHostname && existingHostname.statusPageId !== statusPageId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Hostname is already claimed by another status page",
        });
      }

      const verificationToken = createVerificationToken();

      const domain = await prismaClient.statusPageDomain.upsert({
        where: {
          statusPageId,
        },
        update: {
          hostname,
          verificationToken,
          verificationStatus: "PENDING",
          verifiedAt: null,
        },
        create: {
          statusPageId,
          hostname,
          verificationToken,
          verificationStatus: "PENDING",
        },
      });

      return {
        statusPageId: domain.statusPageId,
        hostname: domain.hostname,
        verificationStatus: domain.verificationStatus,
        ...getDnsRecords(domain.hostname, domain.verificationToken),
      };
    }),

  verify: protectedProcedure
    .input(verifyStatusDomainInput)
    .output(verifyStatusDomainOutput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.userId;
      const { statusPageId, hostname } = input;

      const domain = await prismaClient.statusPageDomain.findFirst({
        where: {
          statusPageId,
          hostname,
          statusPage: {
            userId,
          },
        },
        include: {
          statusPage: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!domain) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Domain mapping not found",
        });
      }

      const dnsRecords = getDnsRecords(
        domain.hostname,
        domain.verificationToken,
      );
      const [txtValues, cnameValues] = await Promise.all([
        resolveTxtValues(dnsRecords.txtRecordName),
        resolveCnameValues(dnsRecords.cnameRecordName),
      ]);

      const txtVerified = txtValues.includes(dnsRecords.txtRecordValue);
      const cnameVerified = cnameValues.includes(
        normalizeDnsValue(dnsRecords.cnameRecordValue),
      );
      const verificationPassed = txtVerified && cnameVerified;

      const updatedDomain = await prismaClient.statusPageDomain.update({
        where: {
          id: domain.id,
        },
        data: {
          verificationStatus: verificationPassed ? "VERIFIED" : "FAILED",
          verifiedAt: verificationPassed ? new Date() : null,
        },
      });

      return {
        statusPageId: updatedDomain.statusPageId,
        hostname: updatedDomain.hostname,
        verificationStatus: updatedDomain.verificationStatus,
        txtVerified,
        cnameVerified,
        verifiedAt: updatedDomain.verifiedAt,
        ...dnsRecords,
      };
    }),

  canIssueTls: publicProcedure
    .input(canIssueTlsInput)
    .output(canIssueTlsOutput)
    .query(async ({ input }) => {
      const domain = await prismaClient.statusPageDomain.findFirst({
        where: {
          hostname: input.hostname,
          verificationStatus: "VERIFIED",
          statusPage: {
            isPublished: true,
          },
        },
        select: {
          id: true,
        },
      });

      return {
        allowed: Boolean(domain),
      };
    }),
});
