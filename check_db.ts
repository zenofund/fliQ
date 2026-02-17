import { db } from "./server/db";
import { escorts } from "./shared/schema";

async function checkViews() {
  try {
    const results = await db.select().from(escorts);
    console.log("Escort Profile Views:");
    results.forEach(e => {
      console.log(`${e.displayName}: ${e.profileViews}`);
    });
  } catch (err) {
    console.error("Error checking views:", err);
  } finally {
    process.exit();
  }
}

checkViews();
