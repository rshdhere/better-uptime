import { prismaClient } from "@repo/store";
import { xAddBulk } from "@repo/streams";

let inFlight = false;

async function publish() {
  if (inFlight) {
    return;
  }
  inFlight = true;
  try {
    // Always fetch fresh websites - never cache, never startup-only
    // Filter by isActive to only publish active websites
    const websites = await prismaClient.website.findMany({
      where: {
        isActive: true,
      },
      select: {
        url: true,
        id: true,
      },
    });

    if (websites.length === 0) {
      console.log(`[Publisher] No active websites found in database`);
      return;
    }

    console.log(
      `[Publisher] Found ${websites.length} active website(s) to publish`,
    );

    await xAddBulk(websites.map((w) => ({ url: w.url, id: w.id })));

    console.log(
      `[Publisher] Successfully published ${websites.length} website(s) to Redis stream`,
    );
  } catch (error) {
    console.error(`[Publisher] Error during publish cycle:`, error);
  } finally {
    inFlight = false;
  }
}

console.log(`[Publisher] Starting publisher service (interval: 3m)`);
setInterval(
  () => {
    publish();
  },
  3 * 60 * 1000,
); // push to the stream, every 3 mins
