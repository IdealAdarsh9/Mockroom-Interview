import { getDb, closeDb } from "../src/server/db";

const db = getDb(); // opening the database applies any pending migrations
const rows = db.prepare("SELECT name, applied_at FROM _migrations ORDER BY name").all() as { name: string; applied_at: string }[];
console.log(`Database ready. ${rows.length} migration(s) applied:`);
for (const r of rows) console.log(`  ${r.name}  (${r.applied_at})`);
closeDb();
