import { PrismaClient } from "@prisma/client";

// Next.js dev mode hot-reloads modules, which would otherwise create a
// new PrismaClient (and new DB connections) on every reload. Caching
// it on `globalThis` avoids exhausting your Supabase connection pool.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
