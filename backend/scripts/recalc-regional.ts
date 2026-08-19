import "dotenv/config";
import { recalculateAllRegionalStats } from "../src/lib/regionalScoring";

async function main() {
  try {
    const result = await recalculateAllRegionalStats();
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
    process.exit(0);
  } catch (e: any) {
    console.error(JSON.stringify({ success: false, error: e?.message || String(e) }, null, 2));
    process.exit(1);
  }
}

main();
