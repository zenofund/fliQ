import 'dotenv/config';
import { db } from './server/db';
import * as schema from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkEscorts() {
  try {
    const allEscorts = await db.select().from(schema.escorts);
    console.log('Escorts in table:', allEscorts.length);
    for (const e of allEscorts) {
      const user = await db.select().from(schema.users).where(eq(schema.users.id, e.userId));
      console.log('Escort User ID:', e.userId, 'Found User:', !!user[0], 'User Role:', user[0]?.role);
      if (user[0]) {
        console.log('User Role (literal):', user[0].role);
        console.log('User ID (literal):', user[0].id);
      }
    }
  } catch (error) {
    console.error('Check failed:', error);
  }
}

checkEscorts();
