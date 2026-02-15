import {
  router,
  statusDomainRouter,
  statusPageRouter,
  userRouter,
  websiteRouter,
} from "@repo/api";

const appRouter = router({
  user: userRouter,
  website: websiteRouter,
  statusPage: statusPageRouter,
  statusDomain: statusDomainRouter,
});

export type AppRouter = typeof appRouter;

export { appRouter };
