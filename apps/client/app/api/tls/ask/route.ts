import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@repo/store/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function normalizeHostname(rawHostname: string | null): string {
  if (!rawHostname) return "";
  return rawHostname.trim().toLowerCase().replace(/\.$/, "");
}

export async function GET(request: NextRequest) {
  const requestedDomain = request.nextUrl.searchParams.get("domain");
  const hostname = normalizeHostname(requestedDomain);

  if (!hostname || !hostname.startsWith("status.")) {
    return new NextResponse("forbidden", { status: 403 });
  }

  try {
    const allowedDomain = await prisma.statusPageDomain.findFirst({
      where: {
        hostname,
        verificationStatus: "VERIFIED",
        statusPage: {
          isPublished: true,
        },
      },
      select: {
        id: true,
      },
    });

    if (!allowedDomain) {
      return new NextResponse("forbidden", { status: 403 });
    }

    return new NextResponse("ok", { status: 200 });
  } catch (error) {
    console.error("[tls.ask] Failed to evaluate domain", { error, hostname });
    return new NextResponse("error", { status: 500 });
  }
}
