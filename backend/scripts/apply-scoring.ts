/**
 * Applies one scoring operation and exits — the Express half of the scoring
 * parity check (tools/parity_scoring.py).
 *
 * The aggregate tables are only ever written through processExternalCombo /
 * revertExternalCombo, which no HTTP route exposes directly, so comparing the
 * two implementations means calling them here rather than over the wire.
 *
 *   npx tsx scripts/apply-scoring.ts add '{"blade":"…", …}'
 *   npx tsx scripts/apply-scoring.ts revert '{…}'
 */

import { processExternalCombo, revertExternalCombo } from "../src/scoreExternalCombo";
import { recalculateAllRegionalStats } from "../src/lib/regionalScoring";

async function main() {
  const [action, payload] = process.argv.slice(2);
  if (!action || (action !== "regional" && !payload)) {
    console.error("usage: apply-scoring.ts <add|revert> '<json>' | apply-scoring.ts regional");
    process.exit(2);
  }

  if (action === "regional") {
    const result = await recalculateAllRegionalStats();
    console.log(JSON.stringify(result));
    process.exit(0);
  }

  const combo = JSON.parse(payload);

  if (action === "add") {
    await processExternalCombo(combo);
  } else if (action === "revert") {
    await revertExternalCombo(combo);
  } else {
    console.error(`unknown action: ${action}`);
    process.exit(2);
  }

  console.log("ok");
  process.exit(0);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
