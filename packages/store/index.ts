import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/index.js";
import { DATABASE_URL } from "@repo/config";

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
export const prismaClient = new PrismaClient({ adapter });
