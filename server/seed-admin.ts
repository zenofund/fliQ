import path from "path";
import dotenv from "dotenv";

// Explicitly load .env from root and override existing env vars
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath, override: true });

async function seedAdmin() {
  // Dynamically import storage to ensure env vars are loaded first
  const { storage } = await import("./storage");
  const { hashPassword } = await import("./auth");

  console.log("Seeding admin account...");
  
  const adminEmail = "admin@fliq.com";
  const existingAdmin = await storage.getUserByEmail(adminEmail);
  
  if (existingAdmin) {
    console.log("Admin account already exists. Updating password...");
    const passwordHash = await hashPassword("admin123");
    // @ts-ignore
    await storage.updateUser(existingAdmin.id, { passwordHash });
    console.log("Admin password updated successfully.");
    process.exit(0);
  }
  
  const passwordHash = await hashPassword("admin123");
  
  try {
    const adminUser = await storage.createUser({
      role: "ADMIN",
      email: adminEmail,
      phone: "08000000000",
      firstName: "Platform",
      lastName: "Admin",
      passwordHash,
    });
    
    console.log("Admin account created successfully:");
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: admin123`);
    console.log(`ID: ${adminUser.id}`);
  } catch (error) {
    console.error("Error creating admin account:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

seedAdmin();
