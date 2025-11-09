import { db } from './db';
import { users } from '@shared/schema';
import { hashPassword } from './auth';

async function seed() {
  console.log('Seeding database...');
  
  // Create a test user
  const hashedPassword = await hashPassword('password123');
  
  await db.insert(users).values({
    email: 'demo@example.com',
    password_hash: hashedPassword,
    displayName: 'Demo User',
    photoURL: null,
  }).onConflictDoNothing();
  
  console.log('Seed complete! Test user created:');
  console.log('Email: demo@example.com');
  console.log('Password: password123');
}

seed().catch(console.error);
