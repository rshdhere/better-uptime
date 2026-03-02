import { NextRequest, NextResponse } from "next/server";
import { prismaClient } from "@repo/store";

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
    const allowedDomain = await prismaClient.statusPageDomain.findFirst({
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
