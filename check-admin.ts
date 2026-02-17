
import { config } from 'dotenv';
config({ override: true });
import { storage } from './server/storage';
import { pool } from './server/db';

async function checkAdmin() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Defined' : 'Undefined');
  if (process.env.DATABASE_URL) {
      console.log('DATABASE_URL starts with:', process.env.DATABASE_URL.substring(0, 15));
  }

  try {
    const adminEmail = "admin@fliq.com";
    console.log(`Checking user with email: ${adminEmail}`);
    const user = await storage.getUserByEmail(adminEmail);
    
    if (user) {
      console.log('User found:');
      console.log('ID:', user.id);
      console.log('Role:', user.role);
      console.log('Password Hash:', user.passwordHash);
      
      if (!user.passwordHash.includes('.')) {
        console.error('ERROR: Password hash does not contain a salt (missing dot separator).');
      } else {
        console.log('Password hash format appears correct (contains dot).');
      }
    } else {
      console.log('User not found.');
    }
  } catch (error) {
    console.error('Error checking admin:', error);
  }
  process.exit(0);
}

checkAdmin();
