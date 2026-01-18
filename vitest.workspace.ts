import { defineWorkspace } from "vitest/config";

// Note: packages/api uses Bun's native test runner (bun test)
export default defineWorkspace(["packages/validators"]);
