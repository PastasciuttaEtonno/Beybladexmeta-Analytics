import 'dotenv/config';

const url = process.env.DATABASE_URL;
console.log("Checking DB URL...");

if (!url) {
    console.log("❌ DATABASE_URL is not set in process.env");
} else {
    try {
        // Parse URL safely
        const u = new URL(url);
        console.log(`✅ DATABASE_URL is set.`);
        console.log(`   Host: ${u.hostname}`);
        console.log(`   Port: ${u.port}`);
        console.log(`   Protocol: ${u.protocol}`);
    } catch (e) {
        console.log("❌ Could not parse URL:", e.message);
    }
}
