import { PrismaClient } from "@prisma/client";

const prismaSchemaVersion = "registration-form-submissions-v3";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaGlobalSchemaVersion: string | undefined;
}

if (process.env.NODE_ENV !== "production") {
  if (global.prismaGlobalSchemaVersion !== prismaSchemaVersion) {
    global.prismaGlobal?.$disconnect();
    global.prismaGlobal = undefined;
  }

  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
    global.prismaGlobalSchemaVersion = prismaSchemaVersion;
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
