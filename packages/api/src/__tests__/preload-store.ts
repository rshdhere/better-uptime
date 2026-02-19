/**
 * Load @repo/store before any test file so prismaClient is initialized
 * and not stuck in TDZ when tests import helpers (which import store).
 */
import "@repo/store";
