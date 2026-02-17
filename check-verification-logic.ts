
// Mock types
interface Booking {
  status: string;
}

interface User {
  isVerified: boolean;
}

// The logic extracted from server/routes.ts
function canBook(user: User, existingBookings: Booking[]): boolean {
  const completedBookings = existingBookings.filter(b => 
    ["COMPLETED", "COMPLETED_CONFIRMED"].includes(b.status)
  );
  
  if (completedBookings.length >= 1 && !user.isVerified) {
    return false; // Blocked
  }
  return true; // Allowed
}

// Test Suite
console.log("Running Verification Logic Tests...\n");

// Case 1: New user, no bookings
const user1: User = { isVerified: false };
const bookings1: Booking[] = [];
console.log(`Case 1: New user (Unverified), 0 bookings -> ${canBook(user1, bookings1) ? "✅ Allowed" : "❌ Blocked"}`);

// Case 2: User with 1 completed booking, Unverified
const user2: User = { isVerified: false };
const bookings2: Booking[] = [{ status: "COMPLETED" }];
console.log(`Case 2: User (Unverified), 1 completed booking -> ${canBook(user2, bookings2) ? "✅ Allowed" : "❌ Blocked (Correct)"}`);

// Case 3: User with 1 completed booking, Verified
const user3: User = { isVerified: true };
const bookings3: Booking[] = [{ status: "COMPLETED" }];
console.log(`Case 3: User (Verified), 1 completed booking -> ${canBook(user3, bookings3) ? "✅ Allowed" : "❌ Blocked"}`);

// Case 4: User with only cancelled bookings, Unverified
const user4: User = { isVerified: false };
const bookings4: Booking[] = [{ status: "CANCELLED" }];
console.log(`Case 4: User (Unverified), 1 cancelled booking -> ${canBook(user4, bookings4) ? "✅ Allowed" : "❌ Blocked"}`);

// Case 5: User with multiple completed bookings, Unverified
const user5: User = { isVerified: false };
const bookings5: Booking[] = [{ status: "COMPLETED" }, { status: "COMPLETED_CONFIRMED" }];
console.log(`Case 5: User (Unverified), 2 completed bookings -> ${canBook(user5, bookings5) ? "✅ Allowed" : "❌ Blocked (Correct)"}`);
