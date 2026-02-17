import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric, uuid, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// 11.1 users
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  role: varchar("role", { length: 20 }).notNull(), // 'CLIENT', 'ESCORT', 'ADMIN'
  email: varchar("email", { length: 255 }).unique().notNull(),
  phone: varchar("phone", { length: 20 }).unique().notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  passwordHash: text("password_hash").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  isSuspended: boolean("is_suspended").default(false).notNull(),
  avatar: text("avatar"),
  verificationDocs: jsonb("verification_docs").default({}).notNull(), // { idType: string, idNumber: string, idImage: string, status: 'PENDING' | 'VERIFIED' | 'REJECTED' }
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires"),
  notificationSettings: jsonb("notification_settings").default({
    bookingUpdates: true,
    newsMessages: true,
    paymentAlerts: true,
    pushNotifications: true
  }).notNull(),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roleIdx: index("role_idx").on(table.role),
  emailIdx: index("email_idx").on(table.email),
}));

// 11.2 escorts
export const escorts = pgTable("escorts", {
  userId: text("user_id").primaryKey().references(() => users.id),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: text("bio"),
  hourlyRate: numeric("hourly_rate").default("25000").notNull(),
  dateOfBirth: timestamp("date_of_birth"),
  gallery: jsonb("gallery").default([]).notNull(), // Array of image URLs
  verificationDocs: jsonb("verification_docs").default({}).notNull(), // { idType: string, idNumber: string, idImage: string, status: 'PENDING' | 'VERIFIED' | 'REJECTED' }
  trustLevel: varchar("trust_level", { length: 20 }).default("BRONZE").notNull(),
  availability: boolean("availability").default(true).notNull(),
  verificationFeePaid: boolean("verification_fee_paid").default(false).notNull(),
  profileViews: integer("profile_views").default(0).notNull(),
  averageRating: numeric("average_rating").default("0.0").notNull(),
  reviewCount: integer("review_count").default(0).notNull(),
  badges: jsonb("badges").default([]).notNull(),
  avatar: text("avatar"),
  services: jsonb("services").default([]).notNull(),
  engagementAgreement: text("engagement_agreement"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  availabilityIdx: index("availability_idx").on(table.availability),
  trustLevelIdx: index("trust_level_idx").on(table.trustLevel),
}));

// 11.3 transfer_recipients
export const transferRecipients = pgTable("transfer_recipients", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  escortId: text("escort_id").references(() => users.id).notNull(),
  recipientCode: text("recipient_code").notNull(),
  bankName: text("bank_name").notNull(),
  lastChangedAt: timestamp("last_changed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 11.4 bookings
export const bookings = pgTable("bookings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  clientId: text("client_id").references(() => users.id).notNull(),
  escortId: text("escort_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 30 }).default("CREATED").notNull(),
  amount: numeric("amount").notNull(),
  commissionRate: numeric("commission_rate").notNull(),
  location: text("location"),
  notes: text("notes"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  clientReviewed: boolean("client_reviewed").default(false).notNull(),
  escortReviewed: boolean("escort_reviewed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index("client_id_idx").on(table.clientId),
  escortIdIdx: index("escort_id_idx").on(table.escortId),
  statusIdx: index("status_idx").on(table.status),
}));

// 11.5 payments
export const payments = pgTable("payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").references(() => bookings.id).notNull(),
  paystackReference: text("paystack_reference").unique().notNull(),
  amount: numeric("amount").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("payments_booking_id_idx").on(table.bookingId),
  paystackRefIdx: index("paystack_ref_idx").on(table.paystackReference),
}));

// 11.6 payouts
export const payouts = pgTable("payouts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").references(() => bookings.id).unique().notNull(),
  escortId: text("escort_id").references(() => users.id).notNull(),
  amount: numeric("amount").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  transferReference: text("transfer_reference").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("payouts_booking_id_idx").on(table.bookingId),
  escortIdIdx: index("payouts_escort_id_idx").on(table.escortId),
}));

// 11.7 disputes
export const disputes = pgTable("disputes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").references(() => bookings.id).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("OPEN").notNull(),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("disputes_booking_id_idx").on(table.bookingId),
}));

// 11.8 audit_logs
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: text("entity_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("entity_idx").on(table.entityType, table.entityId),
}));

// 11.9 admin_settings
export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  verificationFee: numeric("verification_fee").default("1500").notNull(),
  platformFeeRate: numeric("platform_fee_rate").default("0.25").notNull(),
  autoReleaseTimeout: integer("auto_release_timeout").default(12).notNull(), // hours
  disputeWindow: integer("dispute_window").default(60).notNull(), // minutes
  requirePartnerApproval: boolean("require_partner_approval").default(false).notNull(),
  payoutsPaused: boolean("payouts_paused").default(false).notNull(),
  proximityRadius: integer("proximity_radius").default(50).notNull(), // km
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});

export type AdminSettings = typeof adminSettings.$inferSelect;
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;

// 11.10 messages
export const messages = pgTable("messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  senderId: text("sender_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  bookingId: text("booking_id"), // Optional: link message to a specific booking
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  senderIdIdx: index("sender_id_idx").on(table.senderId),
  receiverIdIdx: index("receiver_id_idx").on(table.receiverId),
  bookingIdIdx: index("messages_booking_id_idx").on(table.bookingId),
  createdAtIdx: index("msg_created_at_idx").on(table.createdAt),
}));

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// 11.12 sessions (for connect-pg-simple)
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// 11.13 services
export const services = pgTable("services", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 11.14 reviews
export const reviews = pgTable("reviews", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").references(() => bookings.id).notNull(),
  reviewerId: text("reviewer_id").references(() => users.id).notNull(),
  revieweeId: text("reviewee_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("reviews_booking_id_idx").on(table.bookingId),
  reviewerIdIdx: index("reviewer_id_idx").on(table.reviewerId),
  revieweeIdIdx: index("reviewee_id_idx").on(table.revieweeId),
}));

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  reviewerId: true,
  revieweeId: true,
  createdAt: true,
});

export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;

// 11.15 notifications
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'booking_request', 'message', 'payment', 'system'
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data").default({}).notNull(), // Metadata for redirection
  isRead: boolean("is_read").default(false).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("notifications_user_id_idx").on(table.userId),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
  isArchived: true,
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// 11.16 push_subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id).notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("push_subs_user_id_idx").on(table.userId),
}));

// 11.17 trusted_contacts
export const trustedContacts = pgTable("trusted_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  verificationToken: text("verification_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("trusted_contacts_user_id_idx").on(table.userId),
}));

// 11.18 sos_alerts
export const sosAlerts = pgTable("sos_alerts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id).notNull(),
  bookingId: text("booking_id").references(() => bookings.id),
  status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
  latitude: numeric("latitude").notNull(),
  longitude: numeric("longitude").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  userIdIdx: index("sos_alerts_user_id_idx").on(table.userId),
  statusIdx: index("sos_alerts_status_idx").on(table.status),
}));

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertTrustedContactSchema = createInsertSchema(trustedContacts).omit({
  id: true,
  userId: true,
  isVerified: true,
  createdAt: true,
}).extend({
  phone: z.string().regex(/^\+234\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{4}$/, "Phone number must be in international format (+234 800 000 0000)"),
});

export const insertSosAlertSchema = createInsertSchema(sosAlerts).omit({
  id: true,
  userId: true,
  createdAt: true,
  resolvedAt: true,
}).extend({
  latitude: z.union([z.string(), z.number()]).transform(v => v.toString()),
  longitude: z.union([z.string(), z.number()]).transform(v => v.toString()),
  status: z.string().optional().default("ACTIVE"),
  bookingId: z.string().optional().nullable(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

export type TrustedContact = typeof trustedContacts.$inferSelect;
export type InsertTrustedContact = z.infer<typeof insertTrustedContactSchema>;

export type SosAlert = typeof sosAlerts.$inferSelect;
export type InsertSosAlert = z.infer<typeof insertSosAlertSchema>;

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  escortProfile: one(escorts, {
    fields: [users.id],
    references: [escorts.userId],
  }),
  clientBookings: many(bookings, { relationName: "clientBookings" }),
  escortBookings: many(bookings, { relationName: "escortBookings" }),
  reviewsSent: many(reviews, { relationName: "reviewer" }),
  reviewsReceived: many(reviews, { relationName: "reviewee" }),
  notifications: many(notifications),
  pushSubscriptions: many(pushSubscriptions),
  trustedContacts: many(trustedContacts),
  sosAlerts: many(sosAlerts),
}));

export const trustedContactsRelations = relations(trustedContacts, ({ one }) => ({
  user: one(users, {
    fields: [trustedContacts.userId],
    references: [users.id],
  }),
}));

export const sosAlertsRelations = relations(sosAlerts, ({ one }) => ({
  user: one(users, {
    fields: [sosAlerts.userId],
    references: [users.id],
  }),
  booking: one(bookings, {
    fields: [sosAlerts.bookingId],
    references: [bookings.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  client: one(users, {
    fields: [bookings.clientId],
    references: [users.id],
    relationName: "clientBookings",
  }),
  escort: one(users, {
    fields: [bookings.escortId],
    references: [users.id],
    relationName: "escortBookings",
  }),
  payment: one(payments, {
    fields: [bookings.id],
    references: [payments.bookingId],
  }),
  payout: one(payouts, {
    fields: [bookings.id],
    references: [payouts.bookingId],
  }),
  disputes: many(disputes),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, {
    fields: [reviews.bookingId],
    references: [bookings.id],
  }),
  reviewer: one(users, {
    fields: [reviews.reviewerId],
    references: [users.id],
    relationName: "reviewer",
  }),
  reviewee: one(users, {
    fields: [reviews.revieweeId],
    references: [users.id],
    relationName: "reviewee",
  }),
}));

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  phone: true,
  passwordHash: true,
  role: true,
  firstName: true,
  lastName: true,
}).extend({
  phone: z.string().regex(/^\+234\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{4}$/, "Phone number must be in international format (+234 800 000 0000)"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

export const updateUserSchema = createInsertSchema(users).pick({
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  passwordHash: true,
  latitude: true,
  longitude: true,
  avatar: true,
  verificationDocs: true,
  notificationSettings: true,
}).partial();

export const insertEscortSchema = createInsertSchema(escorts).pick({
  displayName: true,
  bio: true,
  hourlyRate: true,
  dateOfBirth: true,
  gallery: true,
  verificationDocs: true,
  trustLevel: true,
  avatar: true,
  services: true,
  engagementAgreement: true,
  latitude: true,
  longitude: true,
});

export const updateEscortSchema = insertEscortSchema.partial();

export const insertBookingSchema = z.object({
  escortId: z.string(),
  amount: z.string(),
  location: z.string().optional(),
  notes: z.string().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  bookingId: true,
  paystackReference: true,
  amount: true,
  status: true,
});

export const insertPayoutSchema = createInsertSchema(payouts).pick({
  bookingId: true,
  escortId: true,
  amount: true,
  status: true,
  transferReference: true,
});

export const insertDisputeSchema = createInsertSchema(disputes).pick({
  bookingId: true,
  reason: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Escort = typeof escorts.$inferSelect & { isVerified?: boolean };
export type InsertEscort = z.infer<typeof insertEscortSchema>;
export type Booking = typeof bookings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type TransferRecipient = typeof transferRecipients.$inferSelect;
export type InsertTransferRecipient = typeof transferRecipients.$inferInsert;
