
import { db } from "../../src/db";
import { sql } from "drizzle-orm";

async function checkColumns() {
    try {
        const result = await db.execute(sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'cm_match_results'
        `);
        console.log("Columns in cm_match_results:");
        result.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkColumns();
