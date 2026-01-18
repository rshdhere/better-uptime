import { router, userRouter, websiteRouter } from "@repo/api";

const appRouter = router({
  user: userRouter,
  website: websiteRouter,
});

export type AppRouter = typeof appRouter;

export { appRouter };
