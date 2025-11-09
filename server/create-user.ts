import { db } from './db';
import { users } from '@shared/schema';
import { hashPassword } from './auth';

async function createUser() {
  const email = process.argv[2];
  const password = process.argv[3];
  const displayName = process.argv[4];

  if (!email || !password || !displayName) {
    console.error('Usage: npm run create-user <email> <password> <displayName>');
    console.error('Example: npm run create-user john@example.com password123 "John Doe"');
    process.exit(1);
  }

  try {
    // Check if user already exists
    const { eq } = await import('drizzle-orm');
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      console.error(`Error: User with email ${email} already exists`);
      process.exit(1);
    }

    const hashedPassword = await hashPassword(password);
    
    const [newUser] = await db.insert(users).values({
      email,
      password_hash: hashedPassword,
      displayName,
      photoURL: null,
    }).returning();
    
    console.log('\n✅ User created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email: ${newUser.email}`);
    console.log(`Display Name: ${newUser.displayName}`);
    console.log(`Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('Error creating user:', error);
    process.exit(1);
  }
}

createUser();
