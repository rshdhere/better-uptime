// Export tRPC utilities for creating routers
export {
  router,
  publicProcedure,
  protectedProcedure,
  createContext,
} from "./trpc.js";
export type { Context } from "./trpc.js";

// Export routers
export { userRouter } from "./routes/user.js";
export { websiteRouter } from "./routes/website.js";
export { statusPageRouter } from "./routes/status-page.js";
export { statusDomainRouter } from "./routes/status-domain.js";

// Export type utilities
export type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
