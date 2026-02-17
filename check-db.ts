
import 'dotenv/config';
import { db } from "./server/db";
import * as schema from "@shared/schema";
import { sql } from "drizzle-orm";

async function check() {
  try {
    console.log("Checking escorts table columns...");
    const columns = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'escorts'
    `);
    console.log("Columns:", JSON.stringify(columns.rows, null, 2));

    console.log("\nChecking for engagement_agreement data...");
    const data = await db.select({
      userId: schema.escorts.userId,
      displayName: schema.escorts.displayName,
      engagementAgreement: schema.escorts.engagementAgreement
    }).from(schema.escorts).limit(5);
    console.log("Sample Data:", JSON.stringify(data, null, 2));

  } catch (error) {
    console.error("Database check failed:", error);
  } finally {
    process.exit();
  }
}

check();
