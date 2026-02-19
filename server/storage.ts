import { type User, type InsertUser, type Booking, type Payment, type Escort, type Payout, type TransferRecipient, type AdminSettings, type Message, type InsertMessage, type Dispute, type Review, type InsertReview, type Notification, type InsertNotification, type PushSubscription, type InsertPushSubscription } from "@shared/schema";
import * as schema from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, or, desc, sql, avg, count, inArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // Escorts
  getEscorts(coords?: { lat: number, lng: number }): Promise<(Escort & { isBusy: boolean })[]>;
  getEscortById(id: string): Promise<(Escort & { isBusy: boolean, firstName?: string, lastName?: string, email?: string }) | undefined>;
  getPendingVerifications(): Promise<(Escort & { user: User })[]>;
  updateVerificationStatus(userId: string, status: 'VERIFIED' | 'REJECTED', reason?: string): Promise<void>;
  updateEscort(userId: string, partial: Partial<Escort>): Promise<Escort>;
  updateEscortLocation(userId: string, lat: string, lng: string): Promise<Escort>;
  incrementEscortViews(userId: string): Promise<void>;
  
  // Bookings
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingsByClientId(clientId: string): Promise<Booking[]>;
  getBookingsByEscortId(escortId: string): Promise<Booking[]>;
  createBooking(booking: any): Promise<Booking>; 
  updateBooking(id: string, partial: Partial<Booking>): Promise<Booking>;
  updateBookingStatus(id: string, status: string): Promise<Booking | undefined>;
  
  // Payouts
  getPayout(id: string): Promise<Payout | undefined>;
  createPayout(payout: any): Promise<Payout>;
  updatePayout(id: string, partial: Partial<Payout>): Promise<Payout>;
  getPayoutByBookingId(bookingId: string): Promise<Payout | undefined>;
  getPayoutByReference(reference: string): Promise<Payout | undefined>;
  getPayoutsByEscortId(escortId: string): Promise<Payout[]>;
  getAllPayouts(): Promise<Payout[]>;

  // Bank / Recipients
  getTransferRecipientByEscortId(escortId: string): Promise<TransferRecipient | undefined>;
  upsertTransferRecipient(escortId: string, recipientData: any): Promise<TransferRecipient>;
  
  // Admin Settings
  getAdminSettings(): Promise<AdminSettings>;
  updateAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings>;

  // Messages
  createMessage(message: InsertMessage & { isRead?: boolean }): Promise<Message>;
  getMessages(userId1: string, userId2: string): Promise<Message[]>;
  markMessagesAsRead(userId: string, otherId: string): Promise<void>;
  getUserChats(userId: string): Promise<{ userId: string, lastMessage: Message }[]>;
  hasActiveBooking(userId1: string, userId2: string): Promise<boolean>;

  // Reviews
  createReview(review: InsertReview & { reviewerId: string; revieweeId: string }): Promise<Review>;
  getReviewsByRevieweeId(revieweeId: string): Promise<(Review & { reviewerName: string })[]>;
  getReviewsByBookingId(bookingId: string): Promise<Review[]>;

  // Payments & Disputes
  getEscrowBalance(userId: string): Promise<number>;
  getGlobalStats(): Promise<any>;
  getAllDisputes(): Promise<(Dispute & { booking: Booking, client: User, escort: User })[]>;
  createDispute(dispute: any): Promise<Dispute>;
  resolveDispute(disputeId: string, resolution: 'REFUND' | 'RELEASE'): Promise<void>;
  
  // Audit Logs
  createAuditLog(log: any): Promise<void>;
  getAuditLogs(limit?: number): Promise<any[]>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(userId: string): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  getNotification(id: string): Promise<Notification | undefined>;
  deleteNotification(id: string): Promise<void>;
  archiveNotification(id: string): Promise<void>;
  
  // Push Subscriptions
  createPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // Trusted Contacts
  getTrustedContacts(userId: string): Promise<schema.TrustedContact[]>;
  createTrustedContact(userId: string, contact: schema.InsertTrustedContact): Promise<schema.TrustedContact>;
  deleteTrustedContact(id: string, userId: string): Promise<void>;
  verifyTrustedContact(token: string): Promise<boolean>;
  getTrustedContactByToken(token: string): Promise<schema.TrustedContact | undefined>;

  // SOS Alerts
  createSosAlert(userId: string, alert: schema.InsertSosAlert): Promise<schema.SosAlert>;
  getSosAlert(id: string): Promise<schema.SosAlert | undefined>;
  getActiveSosAlert(userId: string): Promise<schema.SosAlert | undefined>;
  resolveSosAlert(id: string, userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values({
      ...insertUser,
      id: randomUUID(),
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      isVerified: false,
      isSuspended: false,
    }).returning();
    
    // If user is an ESCORT, also create an escort profile
    if (user.role === 'ESCORT') {
      await db.insert(schema.escorts).values({
        userId: user.id,
        displayName: `${user.firstName || 'User'} ${user.lastName ? user.lastName[0] + '.' : ''}`,
        hourlyRate: "25000",
        availability: true,
        verificationFeePaid: false,
        profileViews: 0,
      });
    }
    
    return user;
  }

  async updateUser(id: string, partialUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(schema.users)
      .set({ ...partialUser, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    if (!user) throw new Error("User not found");
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(schema.users);
  }

  async getEscorts(coords?: { lat: number, lng: number }): Promise<(Escort & { isBusy: boolean })[]> {
    const settings = await this.getAdminSettings();
    const radius = Number(settings.proximityRadius) || 50;
    
    console.log(`getEscorts - Settings Radius: ${settings.proximityRadius}, Using Radius: ${radius}km`);

    const results = await db
      .select({
        escort: schema.escorts,
        user: schema.users,
      })
      .from(schema.escorts)
      .leftJoin(schema.users, eq(schema.escorts.userId, schema.users.id));

    // Get all ongoing bookings to check busy status
    const ongoingStatuses = ["ACCEPTED", "PAID", "IN_PROGRESS", "COMPLETED"];
    const ongoingBookings = await db.select().from(schema.bookings).where(inArray(schema.bookings.status, ongoingStatuses));
    const busyEscortIds = new Set(ongoingBookings.map(b => b.escortId));

    let escortsWithInfo = results.map(r => ({
      ...r.escort,
      avatar: r.escort.avatar || r.user?.avatar || null,
      isVerified: r.user?.isVerified || false,
      isBusy: busyEscortIds.has(r.escort.userId),
    }));

    if (coords) {
      console.log(`Filtering escorts within ${radius}km of ${coords.lat}, ${coords.lng}`);
      // Filter by proximity radius if coords provided
      escortsWithInfo = escortsWithInfo.filter(escort => {
        if (!escort.latitude || !escort.longitude) {
          console.log(`Escort ${escort.displayName} has no location, filtering out.`);
          return false;
        }
        const distance = this.calculateDistance(
          coords.lat,
          coords.lng,
          parseFloat(escort.latitude),
          parseFloat(escort.longitude)
        );
        const isMatch = distance <= radius;
        console.log(`Escort ${escort.displayName} is ${distance.toFixed(2)}km away. Radius is ${radius}km. Match: ${isMatch}`);
        return isMatch;
      });

      // Sort by distance
      return escortsWithInfo.sort((a, b) => {
        const distA = this.calculateDistance(
          coords.lat, 
          coords.lng, 
          parseFloat(a.latitude!),
          parseFloat(a.longitude!)
        );
        const distB = this.calculateDistance(
          coords.lat, 
          coords.lng, 
          parseFloat(b.latitude!),
          parseFloat(b.longitude!)
        );
        return distA - distB;
      });
    }

    return escortsWithInfo;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  async updateEscortLocation(userId: string, lat: string, lng: string): Promise<Escort> {
    const [updated] = await db.update(schema.escorts)
      .set({ latitude: lat, longitude: lng, updatedAt: new Date() })
      .where(eq(schema.escorts.userId, userId))
      .returning();
    if (!updated) throw new Error("Escort profile not found");
    return updated;
  }

  async getEscortById(id: string): Promise<(Escort & { isBusy: boolean, firstName?: string, lastName?: string, email?: string }) | undefined> {
    const [result] = await db
      .select({
        escort: schema.escorts,
        user: schema.users,
      })
      .from(schema.escorts)
      .leftJoin(schema.users, eq(schema.escorts.userId, schema.users.id))
      .where(eq(schema.escorts.userId, id));

    if (!result) return undefined;

    console.log("Fetched escort from DB:", JSON.stringify(result.escort, null, 2));

    // Check if busy
    const ongoingStatuses = ["ACCEPTED", "PAID", "IN_PROGRESS", "COMPLETED"];
    const ongoingBookings = await db.select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.escortId, id),
          inArray(schema.bookings.status, ongoingStatuses)
        )
      );

    return {
      ...result.escort,
      avatar: result.escort.avatar || result.user?.avatar || null,
      isVerified: result.user?.isVerified || false,
      firstName: result.user?.firstName || undefined,
      lastName: result.user?.lastName || undefined,
      email: result.user?.email || undefined,
      isBusy: ongoingBookings.length > 0,
    };
  }

  async getPendingVerifications(): Promise<any[]> {
    try {
      // Get pending escorts
      const escortResults = await db
        .select({
          escort: schema.escorts,
          user: schema.users,
        })
        .from(schema.escorts)
        .innerJoin(schema.users, eq(schema.escorts.userId, schema.users.id))
        .where(eq(schema.users.role, 'ESCORT'));

      const pendingEscorts = escortResults
        .filter(r => {
          const docs = r.escort.verificationDocs as any;
          const status = docs?.status;
          const hasDocs = !!(docs?.idImage || docs?.selfieImage || docs?.idNumber);
          const isVerified = r.user.isVerified;
          return status === 'PENDING' || (hasDocs && !status && !isVerified);
        })
        .map(r => ({
          ...r.escort,
          user: r.user,
          role: 'ESCORT'
        }));

      // Get pending clients
      const clientResults = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, 'CLIENT'));

      const pendingClients = clientResults
        .filter(u => {
          const docs = u.verificationDocs as any;
          const status = docs?.status;
          const hasDocs = !!(docs?.idImage || docs?.selfieImage || docs?.idNumber);
          const isVerified = u.isVerified;
          return status === 'PENDING' || (hasDocs && !status && !isVerified);
        })
        .map(u => ({
          userId: u.id,
          user: u,
          verificationDocs: u.verificationDocs,
          role: 'CLIENT'
        }));

      return [...pendingEscorts, ...pendingClients];
    } catch (error) {
      console.error("Error in getPendingVerifications:", error);
      throw error;
    }
  }

  async updateVerificationStatus(userId: string, status: 'VERIFIED' | 'REJECTED', reason?: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const currentDocs = (user.verificationDocs as any) || {};
    const updatedDocs = {
      ...currentDocs,
      status,
      rejectionReason: status === 'REJECTED' ? reason : undefined,
      verifiedAt: status === 'VERIFIED' ? new Date().toISOString() : undefined
    };

    await db.transaction(async (tx) => {
      // Update user docs and verification status
      await tx.update(schema.users)
        .set({ 
          verificationDocs: updatedDocs, 
          isVerified: status === 'VERIFIED',
          updatedAt: new Date() 
        })
        .where(eq(schema.users.id, userId));

      // If user is an escort, also update escort profile
      if (user.role === 'ESCORT') {
        const escort = await this.getEscortById(userId);
        if (escort) {
          await tx.update(schema.escorts)
            .set({ verificationDocs: updatedDocs, updatedAt: new Date() })
            .where(eq(schema.escorts.userId, userId));
        }
      }
      
      await this.createAuditLog({
        entityType: 'USER_VERIFICATION',
        entityId: userId,
        action: status,
        metadata: { role: user.role, reason, previousStatus: currentDocs.status }
      });
    });
  }

  async updateEscort(userId: string, partial: Partial<Escort>): Promise<Escort> {
    console.log(`[DatabaseStorage] Updating escort ${userId} with:`, JSON.stringify(partial, null, 2));
    const { isVerified, ...tableData } = partial as any;
    const [updated] = await db.update(schema.escorts)
      .set({
        ...tableData,
        updatedAt: new Date(),
      })
      .where(eq(schema.escorts.userId, userId))
      .returning();
    if (!updated) throw new Error("Escort profile not found");
    console.log(`[DatabaseStorage] Updated escort result:`, JSON.stringify(updated, null, 2));
    return updated;
  }

  async incrementEscortViews(userId: string): Promise<void> {
    await db.update(schema.escorts)
      .set({ profileViews: sql`${schema.escorts.profileViews} + 1` })
      .where(eq(schema.escorts.userId, userId));
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id));
    return booking;
  }

  async getPayout(id: string): Promise<Payout | undefined> {
    const [payout] = await db.select().from(schema.payouts).where(eq(schema.payouts.id, id));
    return payout;
  }

  async getBookingsByClientId(clientId: string): Promise<Booking[]> {
    return await db.select().from(schema.bookings).where(eq(schema.bookings.clientId, clientId));
  }

  async getBookingsByEscortId(escortId: string): Promise<Booking[]> {
    return await db.select().from(schema.bookings).where(eq(schema.bookings.escortId, escortId));
  }

  async createBooking(bookingData: any): Promise<Booking> {
    const [booking] = await db.insert(schema.bookings).values({
      ...bookingData,
      id: randomUUID(),
      status: "CREATED",
    }).returning();
    return booking;
  }

  async updateBooking(id: string, partial: Partial<Booking>): Promise<Booking> {
    const [updated] = await db.update(schema.bookings)
      .set({
        ...partial,
        updatedAt: new Date(),
      })
      .where(eq(schema.bookings.id, id))
      .returning();
    if (!updated) throw new Error("Booking not found");
    return updated;
  }

  async updateBookingStatus(id: string, status: string): Promise<Booking | undefined> {
    const updateData: any = { status };
    if (status === 'IN_PROGRESS') {
      updateData.startedAt = new Date();
    } else if (status === 'COMPLETED' || status === 'COMPLETED_CONFIRMED') {
      updateData.completedAt = new Date();
    }

    const [updated] = await db.update(schema.bookings)
      .set(updateData)
      .where(eq(schema.bookings.id, id))
      .returning();
    return updated;
  }

  async createPayout(payoutData: any): Promise<Payout> {
    const [payout] = await db.insert(schema.payouts).values({
      ...payoutData,
      id: randomUUID(),
    }).returning();
    return payout;
  }

  async updatePayout(id: string, partial: Partial<Payout>): Promise<Payout> {
    const [updated] = await db.update(schema.payouts)
      .set(partial)
      .where(eq(schema.payouts.id, id))
      .returning();
    if (!updated) throw new Error("Payout not found");
    return updated;
  }

  async getPayoutByBookingId(bookingId: string): Promise<Payout | undefined> {
    const [payout] = await db.select().from(schema.payouts).where(eq(schema.payouts.bookingId, bookingId));
    return payout;
  }

  async getPayoutByReference(reference: string): Promise<Payout | undefined> {
    const [payout] = await db.select().from(schema.payouts).where(eq(schema.payouts.transferReference, reference));
    return payout;
  }

  async getPayoutsByEscortId(escortId: string): Promise<Payout[]> {
    return await db.select().from(schema.payouts).where(eq(schema.payouts.escortId, escortId));
  }

  async getAllPayouts(): Promise<Payout[]> {
    return await db.select().from(schema.payouts).orderBy(desc(schema.payouts.createdAt));
  }

  async getTransferRecipientByEscortId(escortId: string): Promise<TransferRecipient | undefined> {
    const [tr] = await db.select().from(schema.transferRecipients).where(eq(schema.transferRecipients.escortId, escortId));
    return tr;
  }

  async upsertTransferRecipient(escortId: string, recipientData: any): Promise<TransferRecipient> {
    const existing = await this.getTransferRecipientByEscortId(escortId);
    if (existing) {
      // Check if details are actually changing
      const isActuallyChanging = existing.recipientCode !== recipientData.recipientCode;
      
      let newLastChangedAt = existing.lastChangedAt;
      if (isActuallyChanging) {
        // If this is the FIRST time they are changing an existing record (lastChangedAt is null),
        // we set it to a date in the far past (Date(0)). This "initializes" the change tracking
        // without triggering the 24h cooldown.
        // Subsequent changes will then see lastChangedAt is not null and set it to now().
        newLastChangedAt = (existing.lastChangedAt === null) ? new Date(0) : new Date();
      }

      const [updated] = await db.update(schema.transferRecipients)
        .set({ ...recipientData, lastChangedAt: newLastChangedAt })
        .where(eq(schema.transferRecipients.id, existing.id))
        .returning();
      return updated;
    }

    const [newRecipient] = await db.insert(schema.transferRecipients).values({
      ...recipientData,
      id: randomUUID(),
      escortId,
      lastChangedAt: null, // Initial setup is always free
    }).returning();
    return newRecipient;
  }

  async getAdminSettings(): Promise<AdminSettings> {
    const [settings] = await db.select().from(schema.adminSettings).where(eq(schema.adminSettings.id, 1));
    if (!settings) {
      // Create default settings if not exists
      const [newSettings] = await db.insert(schema.adminSettings).values({
        id: 1,
        verificationFee: "1500",
        platformFeeRate: "0.25",
        autoReleaseTimeout: 12,
        disputeWindow: 60,
        requirePartnerApproval: false,
        payoutsPaused: false,
        proximityRadius: 50,
      }).returning();
      return newSettings;
    }
    return settings;
  }

  async updateAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
    console.log("Updating Admin Settings with:", JSON.stringify(settings, null, 2));
    
    // Explicitly map fields to ensure Drizzle updates correctly
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (settings.verificationFee !== undefined) updateData.verificationFee = settings.verificationFee;
    if (settings.platformFeeRate !== undefined) updateData.platformFeeRate = settings.platformFeeRate;
    if (settings.autoReleaseTimeout !== undefined) updateData.autoReleaseTimeout = settings.autoReleaseTimeout;
    if (settings.disputeWindow !== undefined) updateData.disputeWindow = settings.disputeWindow;
    if (settings.proximityRadius !== undefined) updateData.proximityRadius = settings.proximityRadius;
    if (settings.requirePartnerApproval !== undefined) updateData.requirePartnerApproval = settings.requirePartnerApproval;
    if (settings.payoutsPaused !== undefined) updateData.payoutsPaused = settings.payoutsPaused;

    const [updated] = await db.update(schema.adminSettings)
      .set(updateData)
      .where(eq(schema.adminSettings.id, 1))
      .returning();

    console.log("Updated Admin Settings result:", JSON.stringify(updated, null, 2));

    await this.createAuditLog({
      entityType: 'SYSTEM_SETTINGS',
      entityId: '1',
      action: 'UPDATED',
      metadata: settings
    });

    return updated;
  }

  async createMessage(message: InsertMessage & { isRead?: boolean }): Promise<Message> {
    const [newMessage] = await db.insert(schema.messages).values({
      ...message,
      id: randomUUID(),
      isRead: message.isRead || false,
    }).returning();
    return newMessage;
  }

  async getMessages(userId1: string, userId2: string): Promise<Message[]> {
    return await db.select().from(schema.messages)
      .where(or(
        and(eq(schema.messages.senderId, userId1), eq(schema.messages.receiverId, userId2)),
        and(eq(schema.messages.senderId, userId2), eq(schema.messages.receiverId, userId1))
      ))
      .orderBy(schema.messages.createdAt);
  }

  async markMessagesAsRead(userId: string, otherId: string): Promise<void> {
    await db.update(schema.messages)
      .set({ isRead: true })
      .where(and(
        eq(schema.messages.receiverId, userId),
        eq(schema.messages.senderId, otherId),
        eq(schema.messages.isRead, false)
      ));
  }

  async getUserChats(userId: string): Promise<{ userId: string, lastMessage: Message }[]> {
    // This is a bit more complex in SQL. We can fetch all messages for the user and then group in JS for simplicity,
    // or use a more advanced SQL query. Given the size, JS grouping is fine for now.
    const allMessages = await db.select().from(schema.messages)
      .where(or(eq(schema.messages.senderId, userId), eq(schema.messages.receiverId, userId)))
      .orderBy(desc(schema.messages.createdAt));

    const chatsMap = new Map<string, Message>();
    allMessages.forEach(m => {
      const otherId = m.senderId === userId ? m.receiverId : m.senderId;
      if (!chatsMap.has(otherId)) {
        chatsMap.set(otherId, m);
      }
    });

    return Array.from(chatsMap.entries()).map(([otherId, lastMessage]) => ({
      userId: otherId,
      lastMessage
    }));
  }

  async hasActiveBooking(userId1: string, userId2: string): Promise<boolean> {
    // 1. Find the booking between these two users that is PAID, IN_PROGRESS, or COMPLETED
    // (We explicitly exclude ACCEPTED or CREATED - payment MUST be done first)
    // (We also exclude COMPLETED_CONFIRMED - chat ends when client confirms)
    const activeBookings = await db.select().from(schema.bookings)
      .where(and(
        or(
          and(eq(schema.bookings.clientId, userId1), eq(schema.bookings.escortId, userId2)),
          and(eq(schema.bookings.clientId, userId2), eq(schema.bookings.escortId, userId1))
        ),
        sql`${schema.bookings.status} IN ('PAID', 'IN_PROGRESS', 'COMPLETED')`
      ));
    
    if (activeBookings.length === 0) return false;

    // 2. Ensure the escort involved has paid their verification fee
    const escortId = activeBookings[0].escortId;
    const [escort] = await db.select().from(schema.escorts).where(eq(schema.escorts.userId, escortId));
    
    return !!escort?.verificationFeePaid;
  }

  async createReview(insertReview: InsertReview & { reviewerId: string; revieweeId: string }): Promise<Review> {
    return await db.transaction(async (tx) => {
      // 1. Insert the review
      const [review] = await tx.insert(schema.reviews).values({
        ...insertReview,
        id: randomUUID(),
      }).returning();

      // 2. Update booking review status
      const booking = await tx.select().from(schema.bookings).where(eq(schema.bookings.id, insertReview.bookingId)).then(rows => rows[0]);
      if (booking) {
        const isClientReviewing = booking.clientId === insertReview.reviewerId;
        await tx.update(schema.bookings)
          .set({
            [isClientReviewing ? 'clientReviewed' : 'escortReviewed']: true,
            updatedAt: new Date()
          })
          .where(eq(schema.bookings.id, insertReview.bookingId));
      }

      // 3. If reviewee is an escort, update their average rating and count
      const [escort] = await tx.select().from(schema.escorts).where(eq(schema.escorts.userId, insertReview.revieweeId));
      if (escort) {
        // Calculate new stats
        const allReviews = await tx.select().from(schema.reviews).where(eq(schema.reviews.revieweeId, insertReview.revieweeId));
        const reviewCount = allReviews.length;
        const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = (totalRating / reviewCount).toFixed(1);

        // Badge promotion logic
        let trustLevel = escort.trustLevel;
        let badges = escort.badges as string[] || [];
        
        const fiveStarReviews = allReviews.filter(r => r.rating === 5).length;
        
        // Example logic: 3 five-stars -> SILVER, 10 five-stars -> GOLD, 25 five-stars -> PLATINUM
        if (fiveStarReviews >= 25 && trustLevel !== 'PLATINUM') {
          trustLevel = 'PLATINUM';
          if (!badges.includes('Elite')) badges.push('Elite');
        } else if (fiveStarReviews >= 10 && trustLevel !== 'GOLD' && trustLevel !== 'PLATINUM') {
          trustLevel = 'GOLD';
          if (!badges.includes('Top Rated')) badges.push('Top Rated');
        } else if (fiveStarReviews >= 3 && trustLevel === 'BRONZE') {
          trustLevel = 'SILVER';
          if (!badges.includes('Rising Star')) badges.push('Rising Star');
        }

        await tx.update(schema.escorts)
          .set({ 
            averageRating, 
            reviewCount, 
            trustLevel,
            badges,
            updatedAt: new Date() 
          })
          .where(eq(schema.escorts.userId, insertReview.revieweeId));
      }

      return review;
    });
  }

  async getReviewsByRevieweeId(revieweeId: string): Promise<(Review & { reviewerName: string })[]> {
    const reviewsWithUser = await db.select({
      review: schema.reviews,
      reviewer: schema.users
    })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.reviews.reviewerId, schema.users.id))
    .where(eq(schema.reviews.revieweeId, revieweeId))
    .orderBy(desc(schema.reviews.createdAt));

    return reviewsWithUser.map(row => {
      const reviewer = row.reviewer;
      let reviewerName = "Anonymous";
      
      if (reviewer.firstName) {
        const first = reviewer.firstName;
        const lastInitial = reviewer.lastName ? ` ${reviewer.lastName.charAt(0)}.` : "";
        reviewerName = `${first}${lastInitial}`;
      }

      return {
        ...row.review,
        reviewerName
      };
    });
  }

  async getReviewsByBookingId(bookingId: string): Promise<Review[]> {
    return await db.select().from(schema.reviews)
      .where(eq(schema.reviews.bookingId, bookingId));
  }

  async getEscrowBalance(userId: string): Promise<number> {
    const activeBookings = await db.select()
      .from(schema.bookings)
      .where(and(
        eq(schema.bookings.clientId, userId),
        sql`${schema.bookings.status} IN ('PAID', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_CONFIRMED', 'PAYOUT_INITIATED')`
      ));
    
    return activeBookings.reduce((acc, b) => acc + Number(b.amount), 0);
  }

  async getGlobalStats(): Promise<any> {
    const statsResult = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE WHEN status IN ('PAID', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_CONFIRMED', 'PAYOUT_INITIATED', 'DISPUTED') THEN amount::numeric ELSE 0 END), 0) as escrow_balance,
        COALESCE(COUNT(CASE WHEN status = 'DISPUTED' THEN 1 END), 0) as active_disputes
      FROM bookings
    `);

    const payoutStatsResult = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE WHEN status IN ('PENDING', 'PROCESSING') THEN amount::numeric ELSE 0 END), 0) as pending_payouts,
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount::numeric ELSE 0 END), 0) as total_payouts
      FROM payouts
    `);

    // Calculate total commission including verification fees paid by escorts
    const commissionStatsResult = await db.execute(sql`
      SELECT (
        SELECT COALESCE(SUM(b.amount::numeric * b.commission_rate::numeric), 0)
        FROM bookings b
        WHERE b.status IN ('PAID', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_CONFIRMED', 'PAYOUT_INITIATED', 'PAID_OUT', 'DISPUTED')
      ) + (
        SELECT COALESCE(SUM(CAST(verification_fee AS numeric)), 0)
        FROM admin_settings
        JOIN escorts ON escorts.verification_fee_paid = true
      ) as total_commission
    `);

    const s = statsResult.rows[0] as any;
    const p = payoutStatsResult.rows[0] as any;
    const c = commissionStatsResult.rows[0] as any;

    return {
      escrowBalance: Number(s.escrow_balance),
      pendingPayouts: Number(p.pending_payouts),
      totalCommission: Number(c.total_commission),
      totalPayouts: Number(p.total_payouts),
      activeDisputes: Number(s.active_disputes)
    };
  }

  async getAllDisputes(): Promise<(Dispute & { booking: Booking, client: User, escort: User })[]> {
    const results = await db.execute(sql`
      SELECT 
        d.*,
        b.id as b_id, b.client_id as b_client_id, b.escort_id as b_escort_id, b.status as b_status, b.amount as b_amount, b.start_time as b_start_time, b.end_time as b_end_time, b.location as b_location, b.commission_rate as b_commission_rate, b.created_at as b_created_at, b.updated_at as b_updated_at,
        c.id as c_id, c.email as c_email, c.first_name as c_first_name, c.last_name as c_last_name, c.role as c_role, c.is_verified as c_is_verified, c.is_suspended as c_is_suspended, c.created_at as c_created_at, c.updated_at as c_updated_at,
        e.id as e_id, e.email as e_email, e.first_name as e_first_name, e.last_name as e_last_name, e.role as e_role, e.is_verified as e_is_verified, e.is_suspended as e_is_suspended, e.created_at as e_created_at, e.updated_at as e_updated_at
      FROM disputes d
      JOIN bookings b ON d.booking_id = b.id
      JOIN users c ON b.client_id = c.id
      JOIN users e ON b.escort_id = e.id
      ORDER BY d.created_at DESC
    `);

    return results.rows.map((row: any) => ({
      id: row.id,
      bookingId: row.booking_id,
      reason: row.reason,
      status: row.status,
      resolution: row.resolution,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      booking: {
        id: row.b_id,
        clientId: row.b_client_id,
        escortId: row.b_escort_id,
        status: row.b_status,
        amount: row.b_amount,
        startTime: row.b_start_time,
        endTime: row.b_end_time,
        location: row.b_location,
        commissionRate: row.b_commission_rate,
        createdAt: row.b_created_at,
        updatedAt: row.b_updated_at
      },
      client: {
        id: row.c_id,
        email: row.c_email,
        firstName: row.c_first_name,
        lastName: row.c_last_name,
        role: row.c_role,
        isVerified: row.c_is_verified,
        isSuspended: row.c_is_suspended,
        createdAt: row.c_created_at,
        updatedAt: row.c_updated_at
      },
      escort: {
        id: row.e_id,
        email: row.e_email,
        firstName: row.e_first_name,
        lastName: row.e_last_name,
        role: row.e_role,
        isVerified: row.e_is_verified,
        isSuspended: row.e_is_suspended,
        createdAt: row.e_created_at,
        updatedAt: row.e_updated_at
      }
    })) as any;
  }

  async createDispute(disputeData: any): Promise<Dispute> {
    const [dispute] = await db.insert(schema.disputes).values({
      ...disputeData,
      id: randomUUID(),
      status: "OPEN",
    }).returning();
    
    // Also update booking status to DISPUTED
    await this.updateBookingStatus(disputeData.bookingId, "DISPUTED");
    
    await this.createAuditLog({
      entityType: 'DISPUTE',
      entityId: dispute.id,
      action: 'CREATED',
      metadata: { bookingId: disputeData.bookingId }
    });

    return dispute;
  }

  async resolveDispute(disputeId: string, resolution: 'REFUND' | 'RELEASE'): Promise<void> {
    const [dispute] = await db.select().from(schema.disputes).where(eq(schema.disputes.id, disputeId));
    if (!dispute) throw new Error("Dispute not found");

    const booking = await this.getBooking(dispute.bookingId);
    if (!booking) throw new Error("Booking not found");

    if (resolution === 'REFUND') {
      await this.updateBookingStatus(dispute.bookingId, "REFUNDED");
      // In a real app, we'd trigger a refund via Paystack here
    } else {
      // If RELEASE, we mark as COMPLETED_CONFIRMED so the system knows funds should go to escort
      await this.updateBookingStatus(dispute.bookingId, "COMPLETED_CONFIRMED");
      // The actual payout will be handled by the route that calls this, 
      // or we can trigger it here if we want to be truly automated.
    }

    await db.update(schema.disputes)
      .set({ status: 'RESOLVED' })
      .where(eq(schema.disputes.id, disputeId));

    await this.createAuditLog({
      entityType: 'DISPUTE',
      entityId: disputeId,
      action: 'RESOLVED',
      metadata: { resolution, bookingId: dispute.bookingId }
    });
  }

  async createAuditLog(logData: any): Promise<void> {
    await db.insert(schema.auditLogs).values({
      ...logData,
      id: randomUUID(),
    });
  }

  async getAuditLogs(limit: number = 20): Promise<any[]> {
    return await db.select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(schema.notifications).values({
      ...notification,
      id: randomUUID(),
      isRead: false,
    }).returning();
    return newNotification;
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
    return notification;
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isArchived, false)
      ))
      .orderBy(desc(schema.notifications.createdAt));
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db.update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, id));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(schema.notifications)
      .set({ isRead: true })
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isRead, false),
        eq(schema.notifications.isArchived, false)
      ));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isRead, false),
        eq(schema.notifications.isArchived, false)
      ));
    return Number(result.count);
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(schema.notifications)
      .where(eq(schema.notifications.id, id));
  }

  async archiveNotification(id: string): Promise<void> {
    await db.update(schema.notifications)
      .set({ isArchived: true })
      .where(eq(schema.notifications.id, id));
  }

  async createPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const [newSub] = await db.insert(schema.pushSubscriptions).values({
      ...sub,
      id: randomUUID(),
    }).onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { 
        userId: sub.userId,
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    }).returning();
    return newSub;
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return await db.select().from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId));
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }

  // Trusted Contacts
  async getTrustedContacts(userId: string): Promise<schema.TrustedContact[]> {
    return await db.select().from(schema.trustedContacts).where(eq(schema.trustedContacts.userId, userId));
  }

  async createTrustedContact(userId: string, contact: schema.InsertTrustedContact): Promise<schema.TrustedContact> {
    const [newContact] = await db.insert(schema.trustedContacts).values({
      ...contact,
      userId,
      id: randomUUID(),
      verificationToken: randomUUID(),
      isVerified: false,
    }).returning();
    return newContact;
  }

  async deleteTrustedContact(id: string, userId: string): Promise<void> {
    await db.delete(schema.trustedContacts).where(and(eq(schema.trustedContacts.id, id), eq(schema.trustedContacts.userId, userId)));
  }

  async verifyTrustedContact(token: string): Promise<boolean> {
    const [updated] = await db.update(schema.trustedContacts)
      .set({ isVerified: true, verificationToken: null })
      .where(eq(schema.trustedContacts.verificationToken, token))
      .returning();
    return !!updated;
  }

  async getTrustedContactByToken(token: string): Promise<schema.TrustedContact | undefined> {
    const [contact] = await db.select().from(schema.trustedContacts).where(eq(schema.trustedContacts.verificationToken, token));
    return contact;
  }

  // SOS Alerts
  async createSosAlert(userId: string, alert: schema.InsertSosAlert): Promise<schema.SosAlert> {
    const [newAlert] = await db.insert(schema.sosAlerts).values({
      ...alert,
      userId,
      id: randomUUID(),
      status: "ACTIVE",
    }).returning();
    return newAlert;
  }

  async getSosAlert(id: string): Promise<schema.SosAlert | undefined> {
    const [alert] = await db.select().from(schema.sosAlerts).where(eq(schema.sosAlerts.id, id));
    return alert;
  }

  async getActiveSosAlert(userId: string): Promise<schema.SosAlert | undefined> {
    const [alert] = await db.select().from(schema.sosAlerts).where(and(eq(schema.sosAlerts.userId, userId), eq(schema.sosAlerts.status, "ACTIVE")));
    return alert;
  }

  async resolveSosAlert(id: string, userId: string): Promise<void> {
    await db.update(schema.sosAlerts)
      .set({ status: "RESOLVED", resolvedAt: new Date() })
      .where(and(eq(schema.sosAlerts.id, id), eq(schema.sosAlerts.userId, userId)));
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private escorts: Map<string, Escort>;
  private bookings: Map<string, Booking>;
  private payments: Map<string, Payment>;
  private payouts: Map<string, Payout>;
  private transferRecipients: Map<string, TransferRecipient>;
  private messages: Message[];
  private reviews: Review[];
  private notifications: Notification[];
  private pushSubscriptions: PushSubscription[];
  private trustedContacts: Map<string, schema.TrustedContact>;
  private sosAlerts: Map<string, schema.SosAlert>;
  private adminSettings: AdminSettings;

  constructor() {
    this.users = new Map();
    this.escorts = new Map();
    this.bookings = new Map();
    this.payments = new Map();
    this.payouts = new Map();
    this.transferRecipients = new Map();
    this.messages = [];
    this.reviews = [];
    this.notifications = [];
    this.pushSubscriptions = [];
    this.trustedContacts = new Map();
    this.sosAlerts = new Map();
    this.adminSettings = {
      id: 1,
      verificationFee: "1500",
      platformFeeRate: "0.25",
      autoReleaseTimeout: 12,
      disputeWindow: 60,
      requirePartnerApproval: false,
      payoutsPaused: false,
      proximityRadius: 50,
      updatedAt: new Date(),
    };
    
    // Seed some mock escorts
    this.seedMockData();
  }
  
  private seedMockData() {
      // Create some mock users who are escorts
      const escortUsers = [
          { id: "1", email: "sarah@fliq.com", role: "ESCORT", isVerified: true },
          { id: "2", email: "jessica@fliq.com", role: "ESCORT", isVerified: true },
          { id: "3", email: "priya@fliq.com", role: "ESCORT", isVerified: false },
          { id: "4", email: "elena@fliq.com", role: "ESCORT", isVerified: true },
      ];
      
      escortUsers.forEach(u => {
          // @ts-ignore
          this.users.set(u.id, { ...u, passwordHash: "mock", isSuspended: false, createdAt: new Date(), updatedAt: new Date(), phone: "000" });
      });

      // Create escort profiles
      const escortsData = [
          { userId: "1", displayName: "Sarah K.", bio: "Elegant and articulate", hourlyRate: "25000", dateOfBirth: new Date("2000-01-01"), gallery: [], verificationDocs: {}, trustLevel: "GOLD", availability: true, verificationFeePaid: true, profileViews: 124, avatar: null, services: ["Dinner", "Social Events"], engagementAgreement: "Please be respectful." },
          { userId: "2", displayName: "Jessica M.", bio: "Fun and bubbly", hourlyRate: "30000", dateOfBirth: new Date("1998-05-15"), gallery: [], verificationDocs: {}, trustLevel: "SILVER", availability: false, verificationFeePaid: true, profileViews: 89, avatar: null, services: ["Parties", "Travel"], engagementAgreement: null },
          { userId: "3", displayName: "Priya D.", bio: "City guide", hourlyRate: "20000", dateOfBirth: new Date("2002-11-20"), gallery: [], verificationDocs: {}, trustLevel: "BRONZE", availability: true, verificationFeePaid: false, profileViews: 45, avatar: null, services: ["City Tour"], engagementAgreement: null },
          { userId: "4", displayName: "Elena R.", bio: "VIP Travel", hourlyRate: "50000", dateOfBirth: new Date("1995-08-10"), gallery: [], verificationDocs: {}, trustLevel: "PLATINUM", availability: true, verificationFeePaid: true, profileViews: 210, avatar: null, services: ["VIP", "International"], engagementAgreement: "Elite standards only." },
      ];
      
      escortsData.forEach(e => {
          // @ts-ignore
          this.escorts.set(e.userId, e);
      });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.phone === phone,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      isVerified: false,
      isSuspended: false,
      avatar: null,
      verificationDocs: {},
      resetToken: null,
      resetTokenExpires: null,
      notificationSettings: {},
      latitude: null,
      longitude: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    
    if (user.role === 'ESCORT') {
        this.escorts.set(id, {
            userId: id,
            displayName: `${user.firstName || 'User'} ${user.lastName ? user.lastName[0] + '.' : ''}`,
            bio: null,
            hourlyRate: "25000",
            dateOfBirth: null,
            gallery: [],
            verificationDocs: {},
            trustLevel: "BRONZE",
            availability: true,
            verificationFeePaid: false,
            profileViews: 0,
            avatar: null,
            engagementAgreement: null,
            latitude: null,
            longitude: null,
            updatedAt: new Date(),
            averageRating: "0",
            reviewCount: 0,
            badges: [],
            services: [],
            completedBookings: 0,
            cancellationRate: "0",
            responseRate: "100",
        });
    }
    
    return user;
  }

  async updateUser(id: string, partialUser: Partial<InsertUser>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updatedUser = { ...user, ...partialUser, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async getEscorts(coords?: { lat: number, lng: number }): Promise<(Escort & { isBusy: boolean })[]> {
    const settings = await this.getAdminSettings();
    const radius = Number(settings.proximityRadius) || 50;
    const escorts = Array.from(this.escorts.values());

    let results = escorts;
    if (coords) {
      console.log(`[MemStorage] Filtering escorts with coords: lat=${coords.lat}, lng=${coords.lng}, radius=${radius}km`);
      // Filter by proximity radius if coords provided
      results = results.filter(escort => {
        if (!escort.latitude || !escort.longitude) {
          console.log(`[MemStorage] Escort ${escort.displayName} has no location, filtering out.`);
          return false;
        }
        const distance = this.calculateDistance(
          coords.lat,
          coords.lng,
          parseFloat(escort.latitude),
          parseFloat(escort.longitude)
        );
        const isMatch = distance <= radius;
        console.log(`[MemStorage] Escort ${escort.displayName} is ${distance.toFixed(2)}km away. Radius is ${radius}km. Match: ${isMatch}`);
        return isMatch;
      });

      // Sort by distance
      results.sort((a, b) => {
        const distA = this.calculateDistance(coords.lat, coords.lng, parseFloat(a.latitude!), parseFloat(a.longitude!));
        const distB = this.calculateDistance(coords.lat, coords.lng, parseFloat(b.latitude!), parseFloat(b.longitude!));
        return distA - distB;
      });
    }
    return results.map(e => ({ ...e, isBusy: false }));
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
  }
  
  async getEscortById(id: string): Promise<(Escort & { isBusy: boolean, firstName?: string, lastName?: string, email?: string }) | undefined> {
    const escort = this.escorts.get(id);
    if (!escort) return undefined;

    console.log(`[MemStorage] Fetched escort ${id}:`, JSON.stringify(escort, null, 2));

    const user = this.users.get(id);
    const ongoingBookings = Array.from(this.bookings.values()).filter(
      b => b.escortId === id && ["ACCEPTED", "PAID", "IN_PROGRESS", "COMPLETED"].includes(b.status)
    );

    return {
      ...escort,
      avatar: escort.avatar || user?.avatar || null,
      isVerified: user?.isVerified || false,
      firstName: user?.firstName || undefined,
      lastName: user?.lastName || undefined,
      email: user?.email || undefined,
      isBusy: ongoingBookings.length > 0,
    };
  }

  async getPendingVerifications(): Promise<(Escort & { user: User })[]> {
    return Array.from(this.escorts.values())
      .filter(e => {
        const docs = e.verificationDocs as any;
        return docs?.status === 'PENDING' || (docs?.idImage && !docs?.status);
      })
      .map(e => ({
        ...e,
        user: this.users.get(e.userId)!
      }));
  }

  async updateVerificationStatus(userId: string, status: 'VERIFIED' | 'REJECTED', reason?: string): Promise<void> {
    const escort = this.escorts.get(userId);
    if (!escort) throw new Error("Escort not found");

    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");

    const currentDocs = (escort.verificationDocs as any) || {};
    const updatedDocs = {
      ...currentDocs,
      status,
      rejectionReason: status === 'REJECTED' ? reason : undefined,
      verifiedAt: status === 'VERIFIED' ? new Date().toISOString() : undefined
    };

    this.escorts.set(userId, { ...escort, verificationDocs: updatedDocs, updatedAt: new Date() });
    
    if (status === 'VERIFIED') {
      this.users.set(userId, { ...user, isVerified: true, updatedAt: new Date() });
    }

    await this.createAuditLog({
      entityType: 'ESCORT_VERIFICATION',
      entityId: userId,
      action: status,
      metadata: { reason, previousStatus: currentDocs.status }
    });
  }

  async updateEscort(userId: string, partial: Partial<Escort>): Promise<Escort> {
      console.log(`[MemStorage] Updating escort ${userId} with:`, JSON.stringify(partial, null, 2));
      const escort = this.escorts.get(userId);
      if (!escort) throw new Error("Escort profile not found");
      const updated = { ...escort, ...partial };
      this.escorts.set(userId, updated);
      console.log(`[MemStorage] Updated escort result:`, JSON.stringify(updated, null, 2));
      return updated;
  }

  async updateEscortLocation(userId: string, lat: string, lng: string): Promise<Escort> {
      const escort = this.escorts.get(userId);
      if (!escort) throw new Error("Escort profile not found");
      const updated = { ...escort, latitude: lat, longitude: lng };
      this.escorts.set(userId, updated);
      return updated;
  }

  async incrementEscortViews(userId: string): Promise<void> {
      const escort = this.escorts.get(userId);
      if (escort) {
          escort.profileViews += 1;
          this.escorts.set(userId, escort);
      }
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async getPayout(id: string): Promise<Payout | undefined> {
    return this.payouts.get(id);
  }

  async getBookingsByClientId(clientId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(
      (b) => b.clientId === clientId
    );
  }

  async getBookingsByEscortId(escortId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(
      (b) => b.escortId === escortId
    );
  }

  async createBooking(bookingData: any): Promise<Booking> {
      const id = randomUUID();
      const booking: Booking = {
          ...bookingData,
          id,
          status: "CREATED",
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
          clientReviewed: false,
          escortReviewed: false,
          updatedAt: new Date(),
      }
      this.bookings.set(id, booking);
      return booking;
  }

  async updateBooking(id: string, partial: Partial<Booking>): Promise<Booking> {
      const booking = this.bookings.get(id);
      if (!booking) throw new Error("Booking not found");
      const updated = { ...booking, ...partial, updatedAt: new Date() };
      this.bookings.set(id, updated);
      return updated;
  }

  async updateBookingStatus(id: string, status: string): Promise<Booking | undefined> {
      const booking = this.bookings.get(id);
      if (!booking) return undefined;
      
      const updatedBooking = { ...booking, status };
      if (status === 'IN_PROGRESS') {
          updatedBooking.startedAt = new Date();
      } else if (status === 'COMPLETED' || status === 'COMPLETED_CONFIRMED') {
          updatedBooking.completedAt = new Date();
      }
      
      this.bookings.set(id, updatedBooking);
      return updatedBooking;
  }

  async createPayout(payoutData: any): Promise<Payout> {
    const id = randomUUID();
    const payout: Payout = {
      ...payoutData,
      id,
      createdAt: new Date(),
    };
    this.payouts.set(id, payout);
    return payout;
  }

  async updatePayout(id: string, partial: Partial<Payout>): Promise<Payout> {
    const payout = this.payouts.get(id);
    if (!payout) throw new Error("Payout not found");
    const updated = { ...payout, ...partial };
    this.payouts.set(id, updated);
    return updated;
  }

  async getPayoutByBookingId(bookingId: string): Promise<Payout | undefined> {
    return Array.from(this.payouts.values()).find(p => p.bookingId === bookingId);
  }

  async getPayoutByReference(reference: string): Promise<Payout | undefined> {
    return Array.from(this.payouts.values()).find(p => p.transferReference === reference);
  }

  async getPayoutsByEscortId(escortId: string): Promise<Payout[]> {
    return Array.from(this.payouts.values()).filter(
      (p) => p.escortId === escortId
    );
  }

  async getAllPayouts(): Promise<Payout[]> {
    return Array.from(this.payouts.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getTransferRecipientByEscortId(escortId: string): Promise<TransferRecipient | undefined> {
    return Array.from(this.transferRecipients.values()).find(
      (tr) => tr.escortId === escortId
    );
  }

  async upsertTransferRecipient(escortId: string, recipientData: any): Promise<TransferRecipient> {
    const existing = await this.getTransferRecipientByEscortId(escortId);
    
    if (existing) {
      const updated: TransferRecipient = {
        ...existing,
        ...recipientData,
        lastChangedAt: new Date(),
      };
      this.transferRecipients.set(existing.id, updated);
      return updated;
    }

    const id = randomUUID();
    const newRecipient: TransferRecipient = {
      id,
      escortId,
      ...recipientData,
      lastChangedAt: new Date(),
    };
    this.transferRecipients.set(id, newRecipient);
    return newRecipient;
  }

  async getAdminSettings(): Promise<AdminSettings> {
    return this.adminSettings;
  }

  async updateAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
    this.adminSettings = { ...this.adminSettings, ...settings, updatedAt: new Date() };
    await this.createAuditLog({
      entityType: 'SYSTEM_SETTINGS',
      entityId: '1',
      action: 'UPDATED',
      metadata: settings
    });
    return this.adminSettings;
  }

  async createMessage(message: InsertMessage & { isRead?: boolean }): Promise<Message> {
    const id = randomUUID();
    const newMessage: Message = {
      ...message,
      id,
      bookingId: message.bookingId || null,
      isRead: message.isRead || false,
      createdAt: new Date(),
    };
    this.messages.push(newMessage);
    return newMessage;
  }

  async getMessages(userId1: string, userId2: string): Promise<Message[]> {
    return this.messages
      .filter(m => 
        (m.senderId === userId1 && m.receiverId === userId2) ||
        (m.senderId === userId2 && m.receiverId === userId1)
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async markMessagesAsRead(userId: string, otherId: string): Promise<void> {
    this.messages.forEach(m => {
      if (m.receiverId === userId && m.senderId === otherId) {
        m.isRead = true;
      }
    });
  }

  async getUserChats(userId: string): Promise<{ userId: string, lastMessage: Message }[]> {
    const chatsMap = new Map<string, Message>();
    
    this.messages.forEach(m => {
      if (m.senderId === userId || m.receiverId === userId) {
        const otherId = m.senderId === userId ? m.receiverId : m.senderId;
        const existing = chatsMap.get(otherId);
        if (!existing || m.createdAt.getTime() > existing.createdAt.getTime()) {
          chatsMap.set(otherId, m);
        }
      }
    });

    return Array.from(chatsMap.entries()).map(([otherId, lastMessage]) => ({
      userId: otherId,
      lastMessage
    }));
  }

  async hasActiveBooking(userId1: string, userId2: string): Promise<boolean> {
    const booking = Array.from(this.bookings.values()).find(b => 
      ((b.clientId === userId1 && b.escortId === userId2) || 
       (b.clientId === userId2 && b.escortId === userId1)) &&
      ["PAID", "IN_PROGRESS"].includes(b.status)
    );

    if (!booking) return false;

    const escort = this.escorts.get(booking.escortId);
    return !!escort?.verificationFeePaid;
  }

  async createReview(insertReview: InsertReview & { reviewerId: string; revieweeId: string }): Promise<Review> {
    const id = randomUUID();
    const review: Review = {
      ...insertReview,
      id,
      comment: insertReview.comment || null,
      createdAt: new Date(),
    };
    this.reviews.push(review);

    // Update booking review status
    const booking = this.bookings.get(insertReview.bookingId);
    if (booking) {
      const isClientReviewing = booking.clientId === insertReview.reviewerId;
      this.bookings.set(booking.id, {
        ...booking,
        [isClientReviewing ? 'clientReviewed' : 'escortReviewed']: true,
        updatedAt: new Date()
      });
    }

    // Update escort stats if reviewee is an escort
    const escort = this.escorts.get(insertReview.revieweeId);
    if (escort) {
      const allReviews = this.reviews.filter(r => r.revieweeId === insertReview.revieweeId);
      const reviewCount = allReviews.length;
      const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
      const averageRating = (totalRating / reviewCount).toFixed(1);

      // Badge logic
      let trustLevel = escort.trustLevel;
      let badges = escort.badges as string[] || [];
      const fiveStarReviews = allReviews.filter(r => r.rating === 5).length;

      if (fiveStarReviews >= 25 && trustLevel !== 'PLATINUM') {
        trustLevel = 'PLATINUM';
        if (!badges.includes('Elite')) badges.push('Elite');
      } else if (fiveStarReviews >= 10 && trustLevel !== 'GOLD' && trustLevel !== 'PLATINUM') {
        trustLevel = 'GOLD';
        if (!badges.includes('Top Rated')) badges.push('Top Rated');
      } else if (fiveStarReviews >= 3 && trustLevel === 'BRONZE') {
        trustLevel = 'SILVER';
        if (!badges.includes('Rising Star')) badges.push('Rising Star');
      }

      this.escorts.set(insertReview.revieweeId, {
        ...escort,
        averageRating,
        reviewCount,
        trustLevel,
        badges,
        updatedAt: new Date()
      });
    }

    return review;
  }

  async getReviewsByRevieweeId(revieweeId: string): Promise<(Review & { reviewerName: string })[]> {
    return this.reviews
      .filter(r => r.revieweeId === revieweeId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(r => {
        const reviewer = this.users.get(r.reviewerId);
        let reviewerName = "Anonymous";
        if (reviewer) {
          if (reviewer.firstName) {
            const first = reviewer.firstName;
            const lastInitial = reviewer.lastName ? ` ${reviewer.lastName.charAt(0)}.` : "";
            reviewerName = `${first}${lastInitial}`;
          }
        }
        return { ...r, reviewerName };
      });
  }

  async getReviewsByBookingId(bookingId: string): Promise<Review[]> {
    return this.reviews.filter(r => r.bookingId === bookingId);
  }

  async getEscrowBalance(userId: string): Promise<number> {
      // Mock calculation based on held payments
      return Array.from(this.bookings.values())
          .filter(b => b.clientId === userId && ["PAID", "IN_PROGRESS"].includes(b.status))
          .reduce((acc, b) => acc + Number(b.amount), 0);
  }

  async getGlobalStats(): Promise<any> {
      const allBookings = Array.from(this.bookings.values());
      const allPayouts = Array.from(this.payouts.values());
      const allEscorts = Array.from(this.escorts.values());

      const escrowBalance = allBookings
          .filter(b => ["PAID", "IN_PROGRESS", "COMPLETED", "COMPLETED_CONFIRMED", "PAYOUT_INITIATED", "DISPUTED"].includes(b.status))
          .reduce((acc, b) => acc + Number(b.amount), 0);

      const pendingPayouts = allPayouts
          .filter(p => ["PENDING", "PROCESSING"].includes(p.status))
          .reduce((acc, p) => acc + Number(p.amount), 0);

      const bookingCommission = allBookings
          .filter(b => ["PAID", "IN_PROGRESS", "COMPLETED", "COMPLETED_CONFIRMED", "PAYOUT_INITIATED", "PAID_OUT", "DISPUTED"].includes(b.status))
          .reduce((acc, b) => acc + (Number(b.amount) * Number(b.commissionRate)), 0);

      const verificationFees = allEscorts
          .filter(e => e.verificationFeePaid)
          .length * 1500; // Using default 1500 for MemStorage

      const totalCommission = bookingCommission + verificationFees;

      const totalPayouts = allPayouts
          .filter(p => p.status === 'SUCCESS')
          .reduce((acc, p) => acc + Number(p.amount), 0);

      const activeDisputes = allBookings.filter(b => b.status === 'DISPUTED').length;

      return {
          escrowBalance,
          pendingPayouts,
          totalCommission,
          totalPayouts,
          activeDisputes
      };
  }

  async getAllDisputes(): Promise<(Dispute & { booking: Booking, client: User, escort: User })[]> {
      // Basic mock implementation for MemStorage
      return [];
  }

  async resolveDispute(disputeId: string, resolution: 'REFUND' | 'RELEASE'): Promise<void> {
      // Basic mock implementation for MemStorage
  }

  async createDispute(disputeData: any): Promise<Dispute> {
      const id = randomUUID();
      const dispute: Dispute = {
          ...disputeData,
          id,
          status: "OPEN",
          createdAt: new Date(),
      };
      // In MemStorage we don't have a disputes map yet, let's add it if needed or just return
      // For now, let's update the booking status at least
      await this.updateBookingStatus(disputeData.bookingId, "DISPUTED");
      return dispute;
  }

  async createAuditLog(log: any): Promise<void> {
      // Basic mock implementation for MemStorage
  }

  async getAuditLogs(limit: number = 20): Promise<any[]> {
      return [
        { id: "1", entityType: "SYSTEM", entityId: "0", action: "STARTUP", metadata: { detail: "MemStorage initialized" }, createdAt: new Date() }
      ];
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const newNotification: Notification = {
      ...notification,
      id,
      isRead: false,
      isArchived: false,
      data: notification.data || null,
      createdAt: new Date(),
    };
    this.notifications.push(newNotification);
    return newNotification;
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return this.notifications
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async markNotificationAsRead(id: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.isRead = true;
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    this.notifications.forEach(n => {
      if (n.userId === userId) {
        n.isRead = true;
      }
    });
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    return this.notifications.filter(n => n.userId === userId && !n.isRead).length;
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    return this.notifications.find(n => n.id === id);
  }

  async deleteNotification(id: string): Promise<void> {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  async archiveNotification(id: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.isArchived = true;
    }
  }

  async createPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const existingIndex = this.pushSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
    const newSub: PushSubscription = {
      ...sub,
      id: randomUUID(),
      createdAt: new Date(),
    };

    if (existingIndex !== -1) {
      this.pushSubscriptions[existingIndex] = newSub;
    } else {
      this.pushSubscriptions.push(newSub);
    }
    return newSub;
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return this.pushSubscriptions.filter(s => s.userId === userId);
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    this.pushSubscriptions = this.pushSubscriptions.filter(s => s.endpoint !== endpoint);
  }

  // Trusted Contacts
  async getTrustedContacts(userId: string): Promise<schema.TrustedContact[]> {
    return Array.from(this.trustedContacts.values()).filter(c => c.userId === userId);
  }

  async createTrustedContact(userId: string, contact: schema.InsertTrustedContact): Promise<schema.TrustedContact> {
    const id = randomUUID();
    const newContact: schema.TrustedContact = {
      ...contact,
      userId,
      id,
      isVerified: false,
      verificationToken: contact.verificationToken || null,
      createdAt: new Date(),
    };
    this.trustedContacts.set(id, newContact);
    return newContact;
  }

  async deleteTrustedContact(id: string, userId: string): Promise<void> {
    const contact = this.trustedContacts.get(id);
    if (contact && contact.userId === userId) {
      this.trustedContacts.delete(id);
    }
  }

  async verifyTrustedContact(token: string): Promise<boolean> {
    const contact = Array.from(this.trustedContacts.values()).find(c => c.verificationToken === token);
    if (!contact) return false;
    // Assuming verifiedAt is optional or part of the type
    // If TS complains, I'll remove it. But schema likely has it.
    // To be safe against type errors, I'll cast or just set isVerified for now.
    // DatabaseStorage sets verifiedAt.
    // Let's try setting it.
    (contact as any).verifiedAt = new Date();
    contact.isVerified = true;
    this.trustedContacts.set(contact.id, contact);
    return true;
  }

  async getTrustedContactByToken(token: string): Promise<schema.TrustedContact | undefined> {
    return Array.from(this.trustedContacts.values()).find(c => c.verificationToken === token);
  }

  // SOS Alerts
  async createSosAlert(userId: string, alert: schema.InsertSosAlert): Promise<schema.SosAlert> {
    const id = randomUUID();
    const newAlert: schema.SosAlert = {
      ...alert,
      userId,
      id,
      status: "ACTIVE",
      bookingId: alert.bookingId || null,
      createdAt: new Date(),
      resolvedAt: null,
    };
    this.sosAlerts.set(id, newAlert);
    return newAlert;
  }

  async getSosAlert(id: string): Promise<schema.SosAlert | undefined> {
    return this.sosAlerts.get(id);
  }

  async getActiveSosAlert(userId: string): Promise<schema.SosAlert | undefined> {
    return Array.from(this.sosAlerts.values()).find(a => a.userId === userId && a.status === "ACTIVE");
  }

  async resolveSosAlert(id: string, userId: string): Promise<void> {
    const alert = this.sosAlerts.get(id);
    if (alert && alert.userId === userId) {
      this.sosAlerts.set(id, { ...alert, status: "RESOLVED", resolvedAt: new Date() });
    }
  }
}

export const storage = process.env.DATABASE_URL ? (console.log("Using DatabaseStorage"), new DatabaseStorage()) : (console.log("Using MemStorage"), new MemStorage());