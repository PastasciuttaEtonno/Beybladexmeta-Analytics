
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq, ilike, or } from "drizzle-orm";

async function main() {
    console.log("Checking for user 'Salas_1'...");

    const found = await db.select().from(users).where(
        or(
            ilike(users.displayName, "%Salas_1%"),
            ilike(users.challongeUsername, "%Salas_1%"),
            ilike(users.challengermodeUsername, "%Salas_1%")
        )
    );

    console.log("Found users:", JSON.stringify(found, null, 2));
    process.exit(0);
}

main().catch(console.error);
