import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { createContext } from "@repo/api/trpc";
import { BACKEND_PORT } from "@repo/config";
import { CORS_ALLOWED_ORIGINS } from "@repo/config/constants";
import { appRouter } from "./index";

const server = createHTTPServer({
  middleware: cors({
    origin: CORS_ALLOWED_ORIGINS,
    credentials: true,
  }),
  router: appRouter,
  createContext,
});

server.listen(BACKEND_PORT);
console.log(`tRPC server listening on http://localhost:${BACKEND_PORT}`);
