import { REGION_ID, WORKER_ID } from "@repo/config";
import { xAckBulk, xReadGroup } from "@repo/streams";
import axios from "axios";

// Validate required environment variables
if (!REGION_ID || !WORKER_ID) {
  console.error(
    "[Worker] Missing required environment variables: REGION_ID and WORKER_ID must be set",
  );
  // eslint-disable-next-line no-undef
  process.exit(1);
}

async function processWebsite(url: string, websiteId: string) {
  const startTime = Date.now();

  try {
    await axios.get(url);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    // TODO: Store to ClickHouse timeseries DB

    // Data to store: response_time_ms, status: "UP", region_id, website_id
    console.log(
      `Website ${websiteId} is UP - Response time: ${responseTime}ms`,
    );
  } catch {
    // TODO: Store to ClickHouse timeseries DB

    // Data to store: status: "DOWN", region_id, website_id
    console.log(`Website ${websiteId} is DOWN`);
  }
}

async function startWorker() {
  while (true) {
    //read from the stream
    const response = await xReadGroup({
      consumerGroup: REGION_ID,
      workerId: WORKER_ID,
    });

    // Process messages if any were received
    if (response.length > 0) {
      for (const message of response) {
        // Process the website and store the result in the DB
        const url = message.event.url;
        const websiteId = message.event.id;

        await processWebsite(url, websiteId);

        // TODO: It should be routed through a queue as a bulk DB request
        console.log("Processing message:", message.id, message.event);

        // TODO: Process the message (check website, store result in DB)
      }

      // Ack back to the queue that this event has been processed
      await xAckBulk({
        consumerGroup: REGION_ID,
        eventIds: response.map(({ id }) => id),
      });
    }

    // Small delay to prevent tight loop when no messages
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

startWorker().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  // eslint-disable-next-line no-undef
  process.exit(1);
});
