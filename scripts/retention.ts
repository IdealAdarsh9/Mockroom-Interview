import { closeDb } from "../src/server/db";
import { retentionSweep } from "../src/server/privacy";

console.log(JSON.stringify(retentionSweep({ id: null, role: "system" }), null, 2));
closeDb();
