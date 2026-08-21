import { db } from '../../src/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const res = await db.execute(sql`
      SELECT viewname, definition 
      FROM pg_views 
      WHERE viewname = 'unified_meta_view';
    `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

main();
