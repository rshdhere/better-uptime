import { prismaClient } from "@repo/store";
import { xAddBulk } from "@repo/streams";

async function publish() {
  try {
    const websites = await prismaClient.website.findMany({
      select: {
        url: true,
        id: true,
      },
    });

    if (websites.length === 0) {
      console.log(`[Publisher] No websites found in database`);
      return;
    }

    console.log(`[Publisher] Found ${websites.length} website(s) to publish`);

    await xAddBulk(websites.map((w) => ({ url: w.url, id: w.id })));

    console.log(
      `[Publisher] Successfully published ${websites.length} website(s) to Redis stream`,
    );
  } catch (error) {
    console.error(`[Publisher] Error during publish cycle:`, error);
  }
}

console.log(`[Publisher] Starting publisher service (interval: 2m)`);
setInterval(
  () => {
    publish();
  },
  2 * 60 * 1000,
); // push to the stream, every 2 mins
