import fs from "node:fs";
import { env } from "../src/server/env";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset a production database.");
  process.exit(1);
}
for (const f of [env.databasePath, `${env.databasePath}-wal`, `${env.databasePath}-shm`]) fs.rmSync(f, { force: true });
fs.rmSync(env.uploadDir, { recursive: true, force: true });
console.log("Local database and uploads removed. Run `npm run db:migrate && npm run db:seed` to recreate them.");
