import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import * as schema from "@shared/schema";
import { insertBookingSchema, updateUserSchema, insertMessageSchema, insertReviewSchema } from "@shared/schema";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { Server as SocketIOServer, Socket } from "socket.io";
import multer from "multer";
import path from "path";
import express from "express";
import fs from "fs";
import webpush from "web-push";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure web-push
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || "mailto:support@fliq-connector.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn("VAPID keys not found. Push notifications will not work.");
}

// Configure multer for file uploads
const storage_multer = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage: storage_multer,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

import { sendResetPasswordEmail } from "./email";
import { sendSosMessagingAlert, sendContactVerificationLink } from "./messaging";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  // Health Check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Password Reset Routes
  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).send("Email is required");

    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Return success even if user not found for security (don't leak emails)
        return res.json({ message: "If an account exists with this email, a reset link has been sent." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600000); // 1 hour from now

      await storage.updateUser(user.id, {
        resetToken: token,
        resetTokenExpires: expires
      });

      await sendResetPasswordEmail(user.email, token, req.get("host") || "localhost:5000");

      res.json({ message: "If an account exists with this email, a reset link has been sent." });
    } catch (error: any) {
      console.error("Forgot Password Error:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).send("Token and password are required");

    try {
      const [user] = await db.select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.resetToken, token),
            sql`${schema.users.resetTokenExpires} > NOW()`
          )
        );

      if (!user) {
        return res.status(400).send("Invalid or expired reset token");
      }

      const passwordHash = await hashPassword(password);
      await storage.updateUser(user.id, {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null
      });

      res.json({ message: "Password has been reset successfully" });
    } catch (error: any) {
      console.error("Reset Password Error:", error);
      res.status(500).send("Internal server error");
    }
  });

  // Serve uploads directory
  app.use("/uploads", express.static("uploads"));

  // File Upload Route
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.file) return res.status(400).send("No file uploaded");
    
    try {
      // Check if Cloudinary is configured
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "fliq_uploads",
        });
        
        // Remove local file after successful upload
        fs.unlinkSync(req.file.path);
        
        return res.json({ url: result.secure_url });
      }

      // Fallback to local storage if Cloudinary is not configured
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ url: fileUrl });
    } catch (error) {
      console.error("Upload Error:", error);
      res.status(500).send("Failed to upload file");
    }
  });

  // Socket.io Setup for Real-time Messaging
  const io = new SocketIOServer(httpServer, { 
    path: "/ws",
    cors: { origin: "*" },
    pingInterval: 10000,
    pingTimeout: 5000
  });
  
  const clients = new Map<string, string>(); // userId -> socketId
  const activeChats = new Map<string, string>(); // userId -> otherUserId (who they are chatting with)
  const activeSosAlerts = new Map<string, string[]>(); // alertId -> list of socketIds watching

  function notifyUser(userId: string, event: string, data: any) {
    const socketId = clients.get(userId);
    if (socketId) {
      io.to(socketId).emit(event, data);
    } else {
      // If user not in clients map, they might be in a room named after their userId
      io.to(userId).emit(event, data);
    }
  }

  async function sendPushNotification(userId: string, payload: { title: string, body: string, data?: any }) {
    try {
      const subscriptions = await storage.getPushSubscriptions(userId);
      const pushPayload = JSON.stringify(payload);

      const sendPromises = subscriptions.map(sub => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        return webpush.sendNotification(pushSubscription, pushPayload)
          .catch(err => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              // Subscription has expired or is no longer valid
              return storage.deletePushSubscription(sub.endpoint);
            }
            throw err;
          });
      });

      await Promise.all(sendPromises);
    } catch (err) {
      console.error("Error sending push notifications:", err);
    }
  }

  async function createAndNotify(userId: string, type: string, title: string, body: string, data: any = {}) {
    try {
      const user = await storage.getUser(userId);
      if (!user) return;

      const settings = (user.notificationSettings as any) || {
        bookingUpdates: true,
        newsMessages: true,
        paymentAlerts: true,
        pushNotifications: true
      };

      // Map internal types to user preference keys
      let isEnabled = true;
      if (type.startsWith("booking_") || type.startsWith("dispute") || type === "message") {
        isEnabled = settings.bookingUpdates ?? true;
      } else if (type === "news") {
        // Support both old 'newMessages' and new 'newsMessages' key for backward compatibility
        isEnabled = settings.newsMessages ?? settings.newMessages ?? true;
      } else if (type.startsWith("payment") || type.startsWith("payout")) {
        isEnabled = settings.paymentAlerts ?? true;
      } else if (type === "verification") {
        isEnabled = true; // Always notify for verification status
      }

      console.log(`Notification debug [${userId}]: type=${type}, isEnabled=${isEnabled}, settings=`, JSON.stringify(settings));

      if (!isEnabled) return;

      const notification = await storage.createNotification({
        userId,
        type,
        title,
        body,
        data
      });
      
      notifyUser(userId, "notification", {
        notification
      });

      // Send push notification if enabled
      if (settings.pushNotifications) {
        await sendPushNotification(userId, {
          title,
          body,
          data: { ...data, notificationId: notification.id }
        });
      }
    } catch (err) {
      console.error("Failed to create/send notification:", err);
    }
  }

  /**
   * Helper to process payout for a booking
   */
  async function handleBookingPayout(booking: any, settings: any) {
    if (settings.payoutsPaused) {
      console.log(`Payout for booking ${booking.id} skipped because payouts are globally paused.`);
      return { payoutPaused: true };
    }

    // Check for 24-hour bank change cooldown
    const recipient = await storage.getTransferRecipientByEscortId(booking.escortId);
    
    // ONLY apply cooldown if:
    // 1. Recipient exists
    // 2. lastChangedAt is NOT null (meaning it has been UPDATED at least once)
    // 3. The current time is within 24h of that change
    if (recipient && recipient.lastChangedAt) {
      const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in ms
      const lastChanged = new Date(recipient.lastChangedAt).getTime();
      const timeSinceChange = Date.now() - lastChanged;
      
      if (timeSinceChange < cooldownPeriod) {
        console.log(`Payout for booking ${booking.id} delayed due to 24h bank change cooldown. Last changed: ${recipient.lastChangedAt}`);
        return { 
          payoutDelayed: true, 
          cooldownRemaining: cooldownPeriod - timeSinceChange,
          message: "Payout delayed due to recent bank details update. Please wait 24 hours."
        };
      }
    }

    const platformFeeRate = Number(booking.commissionRate || settings.platformFeeRate || 0.25);
    const totalAmount = Number(booking.amount);
    const platformFee = totalAmount * platformFeeRate;
    const escortPayout = totalAmount - platformFee;

    console.log(`Initiating payout for booking ${booking.id}. Total: ${totalAmount}, Fee: ${platformFee}, Payout: ${escortPayout}`);

    try {
      // Check if a payout already exists for this booking
      const existingPayout = await storage.getPayoutByBookingId(booking.id);
      if (existingPayout && (existingPayout.status === 'SUCCESS' || existingPayout.status === 'PROCESSING')) {
        console.log(`Payout already ${existingPayout.status} for booking ${booking.id}. Skipping.`);
        return { alreadyProcessed: true };
      }

      if (!recipient) {
        console.error(`Payout failed: Escort ${booking.escortId} has no transfer recipient setup.`);
        const payoutData = {
          bookingId: booking.id,
          escortId: booking.escortId,
          amount: escortPayout.toString(),
          status: "FAILED",
          transferReference: `failed_no_recipient_${randomUUID()}`.substring(0, 250)
        };
        
        if (existingPayout) {
          await storage.updatePayout(existingPayout.id, payoutData);
        } else {
          await storage.createPayout(payoutData);
        }
        return { payoutError: "No transfer recipient setup" };
      }

      // Initiate Paystack Transfer
      const transferBody = {
        source: "balance",
        amount: Math.round(escortPayout * 100), // convert to kobo
        recipient: recipient.recipientCode,
        reason: `Payout for booking ${booking.id}`,
        reference: `payout_${booking.id}_${Date.now()}`,
        currency: "NGN"
      };

      console.log("Initiating Paystack Transfer with body:", JSON.stringify(transferBody));

      const transferRes = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transferBody),
      });

      const transferData = await transferRes.json();
      console.log("Paystack Transfer Response:", JSON.stringify(transferData));

      if (!transferData.status) {
        console.error("Paystack Transfer Payout Error:", transferData);
        
        const payoutData = {
          bookingId: booking.id,
          escortId: booking.escortId,
          amount: escortPayout.toString(),
          status: "FAILED",
          transferReference: `failed_${transferData.message || 'unknown'}_${randomUUID()}`.substring(0, 250)
        };

        if (existingPayout) {
          await storage.updatePayout(existingPayout.id, payoutData);
        } else {
          await storage.createPayout(payoutData);
        }

        let errorMessage = transferData.message;
        if (transferData.message === "Recipient specified is invalid") {
          errorMessage = "Recipient specified is invalid. Please update your bank details in settings.";
        }
        
        return { payoutError: errorMessage };
      }

      // Create/Update payout record
      const payoutData = {
        bookingId: booking.id,
        escortId: booking.escortId,
        amount: escortPayout.toString(),
        status: "PROCESSING",
        transferReference: transferData.data?.reference || `tr_${randomUUID()}`
      };

      if (existingPayout) {
        await storage.updatePayout(existingPayout.id, payoutData);
      } else {
        await storage.createPayout(payoutData);
      }

      // Update booking status to reflect payout initiation
      const finalBooking = await storage.updateBookingStatus(booking.id, "PAYOUT_INITIATED");

      // Notify parties of the transition to PAYOUT_INITIATED
      notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
      notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });

      console.log(`Payout initiated for booking ${booking.id}, status set to PROCESSING`);
      return { success: true, booking: finalBooking };

    } catch (error: any) {
      console.error("Payout Exception:", error);
      const payoutData = {
        bookingId: booking.id,
        escortId: booking.escortId,
        amount: escortPayout.toString(),
        status: "FAILED",
        transferReference: `error_${error.message || 'unknown'}_${randomUUID()}`.substring(0, 250)
      };
      
      const existingPayout = await storage.getPayoutByBookingId(booking.id);
      if (existingPayout) {
        await storage.updatePayout(existingPayout.id, payoutData);
      } else {
        await storage.createPayout(payoutData);
      }
      return { payoutError: error.message };
    }
  }

  /**
   * Background job to auto-release bookings
   */
  function startAutoReleaseJob() {
    console.log("Starting auto-release background job (Interval: 15m)");
    
    setInterval(async () => {
      try {
        const settings = await storage.getAdminSettings();
        const timeoutHours = settings.autoReleaseTimeout || 12;
        
        // Fetch all bookings in COMPLETED status
        // We'll filter them in memory for simplicity, or we could add a storage method
        const allBookings = await storage.getAllBookings();
        const completedBookings = allBookings.filter(b => b.status === "COMPLETED");
        
        const now = Date.now();
        const timeoutMs = timeoutHours * 60 * 60 * 1000;
        
        for (const booking of completedBookings) {
          const updatedAt = new Date(booking.updatedAt).getTime();
          if (now - updatedAt >= timeoutMs) {
            console.log(`Auto-releasing booking ${booking.id} (Timeout: ${timeoutHours}h)`);
            
            // 1. Update status to COMPLETED_CONFIRMED
            await storage.updateBookingStatus(booking.id, "COMPLETED_CONFIRMED");
            
            // 2. Notify parties
            notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
            notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });
            
            await createAndNotify(
              booking.escortId,
              "booking_update",
              "Auto-Release Successful",
              "The booking has been automatically confirmed as completed. Your payout is being processed.",
              { bookingId: booking.id, url: "/dashboard" }
            );
            
            // 3. Trigger payout
            await handleBookingPayout(booking, settings);
          }
        }
      } catch (error) {
        console.error("Error in auto-release job:", error);
      }
    }, 15 * 60 * 1000); // Every 15 minutes
  }

  // Start the background job
  startAutoReleaseJob();

  app.post("/api/push/subscribe", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const { endpoint, p256dh, auth } = req.body;
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).send("Subscription details required");
    }

    try {
      await storage.createPushSubscription({
        userId: req.user!.id,
        endpoint,
        p256dh,
        auth
      });
      res.status(201).json({ message: "Subscribed successfully" });
    } catch (err) {
      console.error("Failed to store push subscription:", err);
      res.status(500).send("Failed to store subscription");
    }
  });

  // Trusted Contacts Routes
  app.get("/api/trusted-contacts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const contacts = await storage.getTrustedContacts(req.user!.id);
      
      // Enhance contacts with registered user status
      const enhancedContacts = await Promise.all(contacts.map(async (contact) => {
        const matchingUser = await storage.getUserByPhone(contact.phone);
        return {
          ...contact,
          isRegistered: !!matchingUser,
          userAvatar: matchingUser?.avatar || null
        };
      }));
      
      res.json(enhancedContacts);
    } catch (err) {
      res.status(500).send("Failed to fetch trusted contacts");
    }
  });

  app.post("/api/trusted-contacts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const parsed = schema.insertTrustedContactSchema.parse(req.body);
      const contact = await storage.createTrustedContact(req.user!.id, parsed);
      
      // Send verification link (Phase 2)
      const protocol = req.protocol;
      const host = req.get("host");
      const verifyLink = `${protocol}://${host}/api/trusted-contacts/verify/${contact.verificationToken}`;
      const userName = req.user!.firstName ? `${req.user!.firstName} ${req.user!.lastName}` : "A user";
      
      await sendContactVerificationLink(contact.phone, userName, verifyLink);
      
      res.status(201).json(contact);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors[0].message });
      }
      res.status(500).send("Failed to create trusted contact");
    }
  });

  app.get("/api/trusted-contacts/verify/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const success = await storage.verifyTrustedContact(token);
      
      if (success) {
        res.send(`
          <html>
            <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #09090b; color: white;">
              <div style="text-align: center; padding: 2rem; background: #18181b; border-radius: 0.5rem; border: 1px solid #27272a;">
                <h1 style="color: #10b981;">Verification Successful!</h1>
                <p>You have been confirmed as a trusted contact. You will now receive alerts in case of an emergency.</p>
                <p style="color: #a1a1aa; font-size: 0.875rem;">You can close this window.</p>
              </div>
            </body>
          </html>
        `);
      } else {
        res.status(400).send("Invalid or expired verification token.");
      }
    } catch (err) {
      res.status(500).send("An error occurred during verification.");
    }
  });

  app.delete("/api/trusted-contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.deleteTrustedContact(req.params.id, req.user!.id);
      res.sendStatus(204);
    } catch (err) {
      res.status(500).send("Failed to delete trusted contact");
    }
  });

  // SOS Routes
  app.get("/api/sos/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const alert = await storage.getActiveSosAlert(req.user!.id);
      res.json(alert || null);
    } catch (err) {
      res.status(500).send("Failed to fetch active SOS alert");
    }
  });

  app.get("/api/sos/alert/:id", async (req, res) => {
    try {
      // This route is partially public because it's shared with trusted contacts
      // who might not have an account. We could add more security later.
      const alert = await storage.getSosAlert(req.params.id);
      if (!alert) return res.status(404).send("Alert not found");
      
      const user = await storage.getUser(alert.userId);
      res.json({ ...alert, user: user ? { firstName: user.firstName, lastName: user.lastName, phone: user.phone } : null });
    } catch (err) {
      res.status(500).send("Failed to fetch SOS alert");
    }
  });

  app.post("/api/sos/alert", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const parsed = schema.insertSosAlertSchema.parse(req.body);
      const alert = await storage.createSosAlert(req.user!.id, parsed);

      // Notify trusted contacts
      const contacts = await storage.getTrustedContacts(req.user!.id);
      const user = req.user!;
      const userName = user.firstName ? `${user.firstName} ${user.lastName}` : "A user";
      
      const notificationPromises = contacts.map(async (contact) => {
        // 1. Send Twilio/WhatsApp message (Phase 4)
        const sosMessage = `EMERGENCY: SOS ALERT from ${userName}! Live location: ${req.get("origin")}/sos/${alert.id}`;
        await sendSosMessagingAlert(contact.phone, sosMessage);

        // 2. Send In-App & Push Notification if contact is a user
        const matchingUser = await storage.getUserByPhone(contact.phone);
        if (matchingUser) {
          await createAndNotify(
            matchingUser.id,
            "sos_alert",
            "EMERGENCY: SOS ALERT",
            `${userName} has triggered an SOS alert! Tap to view live location.`,
            { 
              alertId: alert.id, 
              userId: user.id,
              latitude: alert.latitude,
              longitude: alert.longitude,
              url: `/sos/${alert.id}` 
            }
          );
        }
      });

      await Promise.all(notificationPromises);

      res.status(201).json(alert);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors[0].message });
      }
      console.error("SOS Alert Error:", err);
      res.status(500).send("Failed to trigger SOS alert");
    }
  });

  app.post("/api/sos/resolve/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.resolveSosAlert(req.params.id, req.user!.id);
      res.sendStatus(204);
    } catch (err) {
      res.status(500).send("Failed to resolve SOS alert");
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.on("auth", (message: any) => {
      const userId = message.userId || message.id; // Support both userId and id
      if (userId) {
        clients.set(userId, socket.id);
        socket.join(userId); // Join a room named after the userId
        if (message.activeChatId) {
          activeChats.set(userId, message.activeChatId);
        }
        console.log(`User ${userId} connected via Socket.io (Active Chat: ${message.activeChatId || 'none'})`);
      }
    });

    socket.on("viewing_chat", async (message: any) => {
      if (message.otherId) {
        activeChats.set(message.userId, message.otherId);
        // When they start viewing a chat, mark messages as read
        await storage.markMessagesAsRead(message.userId, message.otherId);
        // Notify the sender
        const senderSocketId = clients.get(message.otherId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messages_read", {
            readerId: message.userId,
            senderId: message.otherId
          });
        }
      } else {
        activeChats.delete(message.userId);
      }
    });

    socket.on("chat", async (message: any) => {
      try {
        const { senderId, receiverId, content, bookingId } = message;
        
        // Check if chat is allowed
        const allowed = await storage.hasActiveBooking(senderId, receiverId);
        if (!allowed) {
          socket.emit("error", {
            message: "Messaging is only allowed for active, paid bookings."
          });
          return;
        }

        // If receiver is currently viewing this chat, mark it as read immediately
        const isRead = activeChats.get(receiverId) === senderId;
        
        // Save to storage
        const savedMsg = await storage.createMessage({
          senderId,
          receiverId,
          content,
          bookingId,
          isRead // New: use the immediate read status
        });

        // Send to receiver if online
        const receiverSocketId = clients.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("chat", {
            message: savedMsg
          });
          
          // If it was marked as read immediately, notify the sender right away
          if (isRead) {
            socket.emit("messages_read", {
              readerId: receiverId,
              senderId: senderId
            });
          }
        }

        // If receiver is NOT currently viewing this chat, send a persistent notification
        if (!isRead) {
          const sender = await storage.getUser(senderId);
          await createAndNotify(
            receiverId,
            "message",
            "New Message",
            `You have a new message from ${sender?.firstName || 'someone'}.`,
            { senderId, bookingId, url: `/messages/${senderId}` }
          );
        }

        // Send confirmation back to sender
        socket.emit("chat_ack", {
          message: savedMsg
        });
      } catch (err) {
        console.error("Socket.io Chat Error:", err);
      }
    });

    socket.on("sos_location_update", (data: { alertId: string, latitude: number, longitude: number }) => {
      // Broadcast location to all sockets watching this alert
      const watchers = activeSosAlerts.get(data.alertId) || [];
      watchers.forEach(socketId => {
        io.to(socketId).emit("sos_location_changed", data);
      });
    });

    socket.on("watch_sos", (alertId: string) => {
      const watchers = activeSosAlerts.get(alertId) || [];
      if (!watchers.includes(socket.id)) {
        activeSosAlerts.set(alertId, [...watchers, socket.id]);
      }
    });

    socket.on("unwatch_sos", (alertId: string) => {
      const watchers = activeSosAlerts.get(alertId) || [];
      activeSosAlerts.set(alertId, watchers.filter(id => id !== socket.id));
    });

    socket.on("disconnect", () => {
      // Remove from clients and activeChats map
      for (const [userId, socketId] of clients.entries()) {
        if (socketId === socket.id) {
          clients.delete(userId);
          activeChats.delete(userId);
          break;
        }
      }

      // Remove from SOS watchers
      for (const [alertId, watchers] of activeSosAlerts.entries()) {
        if (watchers.includes(socket.id)) {
          activeSosAlerts.set(alertId, watchers.filter(id => id !== socket.id));
        }
      }
    });
  });

  // Public Routes
  app.get("/api/escorts", async (req, res) => {
      const { lat, lng } = req.query;
      const coords = (lat !== undefined && lng !== undefined) ? { lat: Number(lat), lng: Number(lng) } : undefined;
      
      console.log(`GET /api/escorts - Params: lat=${lat}, lng=${lng}. Coords: ${JSON.stringify(coords)}`);
      
      const escorts = await storage.getEscorts(coords);
      const availableEscorts = escorts.filter(e => e.availability === true);
      res.json(availableEscorts);
  });
  
  app.get("/api/escorts/:id", async (req, res) => {
      const escort = await storage.getEscortById(req.params.id);
      if (!escort) return res.sendStatus(404);
      
      // Increment views
      await storage.incrementEscortViews(req.params.id);
      
      res.json(escort);
  });

  // Protected Routes
  app.post("/api/bookings", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // @ts-ignore
      if (req.user.role !== "CLIENT") {
          return res.status(403).send("Only client accounts can book companions. Please use a client account.");
      }
      
      const bookingData = insertBookingSchema.parse(req.body);
      
      // @ts-ignore
      if (bookingData.escortId === req.user.id) {
          return res.status(400).send("You cannot book yourself.");
      }

      // Check for active bookings between this client and escort
      const existingBookings = await storage.getBookingsByClientId((req.user as any).id);
      
      // Check if client needs verification (Required after 1st successful booking)
      const completedBookings = existingBookings.filter(b => 
        ["COMPLETED", "COMPLETED_CONFIRMED"].includes(b.status)
      );
      
      // @ts-ignore
      if (completedBookings.length >= 1 && !req.user.isVerified) {
        return res.status(403).json({
          message: "ID Verification Required",
          error: "You must verify your ID to continue making bookings. Please upload your identification documents in settings.",
          code: "VERIFICATION_REQUIRED"
        });
      }

      const activeStatuses = ["CREATED", "ACCEPTED", "PAID", "IN_PROGRESS", "COMPLETED"];
      const hasActiveBooking = existingBookings.some(b => 
        b.escortId === bookingData.escortId && 
        activeStatuses.includes(b.status)
      );

      if (hasActiveBooking) {
        return res.status(400).send("You already have an active booking with this companion. Please complete it before booking again.");
      }

      const settings = await storage.getAdminSettings();
      const booking = await storage.createBooking({
          ...bookingData,
          clientId: (req.user as any).id,
          status: "CREATED",
          commissionRate: settings.platformFeeRate || "0.25",
      });
      
      // Notify escort of new booking
      notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });
      
      await createAndNotify(
        booking.escortId,
        "booking_request",
        "New Booking Request",
        `You have a new booking request for ${booking.amount} NGN.`,
        { bookingId: booking.id, url: "/dashboard" }
      );
      
      res.status(201).json(booking);
  });

  app.patch("/api/bookings/:id/status", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const { status } = req.body;
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.sendStatus(404);

      // Enforce Escort requirements for accepting bookings
      if (status === "ACCEPTED") {
          // @ts-ignore
          if (req.user.role !== "ESCORT") return res.status(403).send("Only escorts can accept bookings");
          
          // @ts-ignore
          const escortProfile = await storage.getEscortById(req.user.id);
          if (!escortProfile?.verificationFeePaid) {
              return res.status(403).send("You must pay the verification fee before accepting bookings.");
          }

          // @ts-ignore
          const recipient = await storage.getTransferRecipientByEscortId(req.user.id);
          if (!recipient) {
              return res.status(403).send("You must set up your payout bank account before accepting bookings.");
          }

          // Ensure escort doesn't have another ongoing booking
          // @ts-ignore
          const ongoingBookings = await storage.getBookingsByEscortId(req.user.id);
          const ongoingStatuses = ["ACCEPTED", "PAID", "IN_PROGRESS", "COMPLETED"];
          const hasOngoingBooking = ongoingBookings.some(b => 
            b.id !== req.params.id && // Don't count the current booking we are trying to accept
            ongoingStatuses.includes(b.status)
          );

          if (hasOngoingBooking) {
            return res.status(400).send("You already have an ongoing booking. You must complete it and receive confirmation before accepting another.");
          }
      }

      // Simple RBAC check
      // Clients can only mark as COMPLETED_CONFIRMED (from IN_PROGRESS)
      // Escorts can only mark as IN_PROGRESS (from ACCEPTED)
      
      const updatedBooking = await storage.updateBookingStatus(req.params.id, status);
      
      // Notify both parties of status change
      notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
      notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });

      // Add persistent notifications for status changes
      if (status === "ACCEPTED") {
        await createAndNotify(
          booking.clientId,
          "booking_update",
          "Booking Accepted",
          "Your booking has been accepted! Please proceed with payment.",
          { bookingId: booking.id, url: "/dashboard" }
        );
      } else if (status === "PAID") {
        await createAndNotify(
          booking.escortId,
          "booking_update",
          "Booking Paid",
          "The client has paid for the booking. You can now start the session.",
          { bookingId: booking.id, url: "/dashboard" }
        );
      } else if (status === "COMPLETED") {
        await createAndNotify(
          booking.clientId,
          "booking_update",
          "Booking Completed",
          "The companion has marked the session as completed. Please confirm to release funds.",
          { bookingId: booking.id, url: "/dashboard" }
        );
      } else if (status === "COMPLETED_CONFIRMED") {
        await createAndNotify(
          booking.escortId,
          "booking_update",
          "Payment Released",
          "The client has confirmed completion. Your payout is being processed.",
          { bookingId: booking.id, url: "/dashboard" }
        );
      } else if (status === "CANCELLED") {
        const otherPartyId = (req.user as any).id === booking.clientId ? booking.escortId : booking.clientId;
        await createAndNotify(
          otherPartyId,
          "booking_update",
          "Booking Cancelled",
          "A booking has been cancelled.",
          { bookingId: booking.id, url: "/dashboard" }
        );
      }

      // If client confirmed completion, trigger automatic payout
      if (status === "COMPLETED_CONFIRMED") {
        const settings = await storage.getAdminSettings();
        
        if (settings.payoutsPaused) {
          console.log(`Payout for booking ${booking.id} skipped because payouts are globally paused.`);
          return res.json({ ...updatedBooking, payoutPaused: true });
        }

        // Check for 24-hour bank change cooldown
        const recipient = await storage.getTransferRecipientByEscortId(booking.escortId);
        
        // ONLY apply cooldown if:
        // 1. Recipient exists
        // 2. lastChangedAt is NOT null (meaning it has been UPDATED at least once)
        // 3. The current time is within 24h of that change
        if (recipient && recipient.lastChangedAt) {
          const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in ms
          const lastChanged = new Date(recipient.lastChangedAt).getTime();
          const timeSinceChange = Date.now() - lastChanged;
          
          if (timeSinceChange < cooldownPeriod) {
            console.log(`Payout for booking ${booking.id} delayed due to 24h bank change cooldown. Last changed: ${recipient.lastChangedAt}`);
            return res.json({ 
              ...updatedBooking, 
              payoutDelayed: true, 
              cooldownRemaining: cooldownPeriod - timeSinceChange,
              message: "Payout delayed due to recent bank details update. Please wait 24 hours."
            });
          }
        }

        const platformFeeRate = Number(booking.commissionRate || settings.platformFeeRate || 0.25);
        const totalAmount = Number(booking.amount);
        const platformFee = totalAmount * platformFeeRate;
        const escortPayout = totalAmount - platformFee;

        console.log(`Initiating payout for booking ${booking.id}. Total: ${totalAmount}, Fee: ${platformFee}, Payout: ${escortPayout}`);

        try {
          // Check if a payout already exists for this booking
          const existingPayout = await storage.getPayoutByBookingId(booking.id);
          if (existingPayout && (existingPayout.status === 'SUCCESS' || existingPayout.status === 'PROCESSING')) {
            console.log(`Payout already ${existingPayout.status} for booking ${booking.id}. Skipping.`);
            return res.json(updatedBooking);
          }

          if (!recipient) {
            console.error(`Payout failed: Escort ${booking.escortId} has no transfer recipient setup.`);
            const payoutData = {
              bookingId: booking.id,
              escortId: booking.escortId,
              amount: escortPayout.toString(),
              status: "FAILED",
              transferReference: `failed_no_recipient_${randomUUID()}`.substring(0, 250)
            };
            
            if (existingPayout) {
              await storage.updatePayout(existingPayout.id, payoutData);
            } else {
              await storage.createPayout(payoutData);
            }
            return res.json({ ...updatedBooking, payoutError: "No transfer recipient setup" });
          }

          // 2. Initiate Paystack Transfer
          const transferBody = {
            source: "balance",
            amount: Math.round(escortPayout * 100), // convert to kobo
            recipient: recipient.recipientCode,
            reason: `Payout for booking ${booking.id}`,
            reference: `payout_${booking.id}_${Date.now()}`,
            currency: "NGN"
          };

          console.log("Initiating Paystack Transfer with body:", JSON.stringify(transferBody));

          const transferRes = await fetch("https://api.paystack.co/transfer", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(transferBody),
          });

          const transferData = await transferRes.json();
          console.log("Paystack Transfer Response:", JSON.stringify(transferData));

          if (!transferData.status) {
            console.error("Paystack Transfer Payout Error:", transferData);
            
            const payoutData = {
              bookingId: booking.id,
              escortId: booking.escortId,
              amount: escortPayout.toString(),
              status: "FAILED",
              transferReference: `failed_${transferData.message || 'unknown'}_${randomUUID()}`.substring(0, 250)
            };

            if (existingPayout) {
              await storage.updatePayout(existingPayout.id, payoutData);
            } else {
              await storage.createPayout(payoutData);
            }

            // Provide more specific error for "Recipient specified is invalid"
            let errorMessage = transferData.message;
            if (transferData.message === "Recipient specified is invalid") {
              errorMessage = "Recipient specified is invalid. Please update your bank details in settings.";
            }
            
            return res.json({ ...updatedBooking, payoutError: errorMessage });
          }

          // 3. Create/Update payout record
          const payoutData = {
            bookingId: booking.id,
            escortId: booking.escortId,
            amount: escortPayout.toString(),
            status: "PROCESSING",
            transferReference: transferData.data?.reference || `tr_${randomUUID()}`
          };

          if (existingPayout) {
            await storage.updatePayout(existingPayout.id, payoutData);
          } else {
            await storage.createPayout(payoutData);
          }

          // 4. Update booking status to reflect payout initiation
          const finalBooking = await storage.updateBookingStatus(booking.id, "PAYOUT_INITIATED");

          // Notify parties of the transition to PAYOUT_INITIATED
          notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
          notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });

          console.log(`Payout initiated for booking ${booking.id}, status set to PROCESSING`);
          return res.json(finalBooking);

        } catch (error: any) {
          console.error("Payout Exception:", error);
          const payoutData = {
            bookingId: booking.id,
            escortId: booking.escortId,
            amount: escortPayout.toString(),
            status: "FAILED",
            transferReference: `error_${error.message || 'unknown'}_${randomUUID()}`.substring(0, 250)
          };
          
          const existingPayout = await storage.getPayoutByBookingId(booking.id);
          if (existingPayout) {
            await storage.updatePayout(existingPayout.id, payoutData);
          } else {
            await storage.createPayout(payoutData);
          }
          return res.json({ ...updatedBooking, payoutError: error.message });
        }
      }
      
      res.json(updatedBooking);
  });

  app.post("/api/disputes", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { bookingId, reason } = req.body;
    
    if (!bookingId || !reason) {
      return res.status(400).send("Booking ID and reason are required");
    }

    const booking = await storage.getBooking(bookingId);
    if (!booking) return res.status(404).send("Booking not found");
    
    // Only client or escort of the booking can raise a dispute
    // @ts-ignore
    if (booking.clientId !== req.user.id && booking.escortId !== req.user.id) {
      return res.status(403).send("You are not authorized to dispute this booking");
    }

    const dispute = await storage.createDispute({ bookingId, reason });
    
    // Notify the other party of the dispute
    const otherPartyId = booking.clientId === (req.user as any).id ? booking.escortId : booking.clientId;
    notifyUser(otherPartyId, "BOOKING_UPDATE", { bookingId: booking.id });

    await createAndNotify(
      otherPartyId,
      "dispute",
      "Dispute Raised",
      `A dispute has been raised for booking #${booking.id.substring(0, 8)}.`,
      { bookingId: booking.id, url: "/dashboard" }
    );
    
    res.status(201).json(dispute);
  });

  app.get("/api/payouts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    if (req.user.role !== "ESCORT") return res.sendStatus(403);

    // @ts-ignore
    const payouts = await storage.getPayoutsByEscortId(req.user.id);
    res.json(payouts);
  });

  // Notification Routes
  app.get("/api/notifications", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const notifications = await storage.getNotifications(req.user.id);
    res.json(notifications);
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const count = await storage.getUnreadNotificationCount(req.user.id);
    res.json({ count });
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.markNotificationAsRead(req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // @ts-ignore
      await storage.markAllNotificationsAsRead(req.user.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const notification = await storage.getNotification(req.params.id);
      // @ts-ignore
      if (!notification || notification.userId !== req.user.id) {
        return res.sendStatus(403);
      }
      await storage.deleteNotification(req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.patch("/api/notifications/:id/archive", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const notification = await storage.getNotification(req.params.id);
      // @ts-ignore
      if (!notification || notification.userId !== req.user.id) {
        return res.sendStatus(403);
      }
      await storage.archiveNotification(req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error archiving notification:", error);
      res.status(500).send("Internal server error");
    }
  });

  // Review Routes
  app.post("/api/reviews", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const reviewData = insertReviewSchema.parse(req.body);
      
      // Verify the booking exists and is completed
      const booking = await storage.getBooking(reviewData.bookingId);
      if (!booking) return res.status(404).send("Booking not found");
      
      const allowedStatuses = ["COMPLETED", "COMPLETED_CONFIRMED", "PAYOUT_INITIATED", "PAID_OUT"];
      if (!allowedStatuses.includes(booking.status)) {
        return res.status(400).send("Reviews can only be submitted for completed bookings.");
      }

      // Ensure the reviewer is part of the booking
      // @ts-ignore
      if (booking.clientId !== req.user.id && booking.escortId !== req.user.id) {
        return res.status(403).send("You are not authorized to review this booking.");
      }

      // Automatically set the IDs
      // @ts-ignore
      const reviewerId = req.user.id;
      // @ts-ignore
      const revieweeId = booking.clientId === req.user.id ? booking.escortId : booking.clientId;
      
      // Check if this user has already reviewed this booking
      const existingReviews = await storage.getReviewsByBookingId(reviewData.bookingId);
      const alreadyReviewed = existingReviews.some(r => r.reviewerId === reviewerId);
      if (alreadyReviewed) {
        return res.status(400).send("You have already reviewed this booking.");
      }

      const review = await storage.createReview({
        ...reviewData,
        reviewerId,
        revieweeId
      });
      
      // Update booking to mark that this user has reviewed
      // @ts-ignore
      if (booking.clientId === req.user.id) {
        await storage.updateBooking(booking.id, { clientReviewed: true });
      } else {
        await storage.updateBooking(booking.id, { escortReviewed: true });
      }
      
      // Notify reviewee
      notifyUser(revieweeId, "NEW_REVIEW", { 
        bookingId: reviewData.bookingId,
        rating: reviewData.rating 
      });

      res.status(201).json(review);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json(error.errors);
      }
      console.error("Create Review Error:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.get("/api/reviews/escort/:id", async (req, res) => {
    try {
      const reviews = await storage.getReviewsByRevieweeId(req.params.id);
      res.json(reviews);
    } catch (error) {
      res.status(500).send("Internal server error");
    }
  });

  app.get("/api/reviews/booking/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const reviews = await storage.getReviewsByBookingId(req.params.id);
      res.json(reviews);
    } catch (error) {
      res.status(500).send("Internal server error");
    }
  });

  // Paystack Webhook
  app.post("/api/webhooks/paystack", async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.sendStatus(500);

    // Validate signature
    const hash = crypto.createHmac("sha512", secret).update(JSON.stringify(req.body)).digest("hex");
    if (hash !== req.headers["x-paystack-signature"]) {
      return res.sendStatus(400);
    }

    const event = req.body;
    console.log("Paystack Webhook Event:", event.event);

    try {
      if (event.event === "transfer.success") {
        const reference = event.data.reference;
        const payout = await storage.getPayoutByReference(reference);
        if (payout) {
          await storage.updatePayout(payout.id, { status: "SUCCESS" });
          // Update booking status to PAID_OUT
          const booking = await storage.updateBookingStatus(payout.bookingId, "PAID_OUT");
          console.log(`Payout ${payout.id} marked as SUCCESS via webhook and booking ${payout.bookingId} marked as PAID_OUT`);
          
          // Notify parties
          if (booking) {
            notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
            notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });
            
            await createAndNotify(
              booking.escortId,
              "payout_success",
              "Payout Successful",
              `Your payout of ${payout.amount} NGN for booking #${booking.id.substring(0, 8)} was successful.`,
              { bookingId: booking.id, url: "/dashboard" }
            );
          }
        }
      } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
        const reference = event.data.reference;
        const payout = await storage.getPayoutByReference(reference);
        if (payout) {
          await storage.updatePayout(payout.id, { status: "FAILED" });
          // Update booking status back to COMPLETED_CONFIRMED so admin can retry or investigate
          const booking = await storage.updateBookingStatus(payout.bookingId, "COMPLETED_CONFIRMED");
          console.log(`Payout ${payout.id} marked as FAILED via webhook and booking ${payout.bookingId} reset to COMPLETED_CONFIRMED`);
          
          // Notify parties
          if (booking) {
            notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
            notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });
            
            await createAndNotify(
              booking.escortId,
              "payout_failed",
              "Payout Failed",
              `Your payout for booking #${booking.id.substring(0, 8)} failed. Our admin will investigate and retry.`,
              { bookingId: booking.id, url: "/dashboard" }
            );
          }
        }
      } else if (event.event === "charge.success") {
        // Handle successful payment initialization if needed
        // Currently handled by transaction verification route
      }
    } catch (error) {
      console.error("Webhook processing error:", error);
    }

    res.sendStatus(200);
  });

  // Bank & Recipient Routes
  app.get("/api/banks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error("CRITICAL: PAYSTACK_SECRET_KEY is missing from environment!");
      return res.status(500).send("Payment provider not configured");
    }

    console.log("Fetching banks from Paystack...");
    try {
      const response = await fetch("https://api.paystack.co/bank?currency=NGN", {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      });
      const data = await response.json();
      
      if (!data.status) {
        console.error("Paystack Banks Error Data:", data);
        throw new Error(data.message || "Failed to fetch banks");
      }

      const banks = data.data.map((bank: any) => ({
        id: bank.id,
        name: bank.name,
        code: bank.code,
      }));
      
      console.log(`Successfully fetched ${banks.length} banks.`);
      res.json(banks);
    } catch (error: any) {
      console.error("Paystack Banks Exception:", error);
      res.status(500).send(error.message);
    }
  });

  app.post("/api/banks/resolve", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error("CRITICAL: PAYSTACK_SECRET_KEY is missing from environment!");
      return res.status(500).send("Payment provider not configured");
    }

    const { accountNumber, bankCode } = req.body;
    
    if (!accountNumber || !bankCode) {
      return res.status(400).send("Account number and bank code required");
    }

    console.log(`Paystack: Resolving ${accountNumber} with bank code ${bankCode}...`);
    try {
      const url = `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      });
      const data = await response.json();
      
      if (!data.status) {
        console.error("Paystack Resolve Error Data:", data);
        // Send the actual Paystack error message back to frontend
        return res.status(400).json({ 
          message: data.message || "Could not resolve account details",
          paystack_error: data 
        });
      }

      console.log("Paystack: Successfully resolved account name:", data.data.account_name);
      res.json(data);
    } catch (error: any) {
      console.error("Paystack Resolve Exception:", error);
      res.status(500).send(error.message);
    }
  });

  app.get("/api/escort/recipient", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const recipient = await storage.getTransferRecipientByEscortId(req.user.id);
    if (!recipient) return res.sendStatus(404);
    res.json(recipient);
  });

  // Admin Routes
  const isAdmin = (req: any, res: any, next: any) => {
    console.log(`Admin Check - Authenticated: ${req.isAuthenticated()}, Role: ${req.user?.role}`);
    if (req.isAuthenticated() && req.user.role === "ADMIN") {
      return next();
    }
    res.status(403).json({ message: "Forbidden: Admin access required" });
  };

  app.get("/api/admin/stats", isAdmin, async (_req, res) => {
    const stats = await storage.getGlobalStats();
    res.json(stats);
  });

  app.get("/api/admin/disputes", isAdmin, async (_req, res) => {
    const disputes = await storage.getAllDisputes();
    res.json(disputes);
  });

  app.get("/api/admin/verifications", isAdmin, async (req, res) => {
    try {
      const verifications = await storage.getPendingVerifications();
      res.json(verifications);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/verifications/:userId/approve", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.updateVerificationStatus(req.params.userId, 'VERIFIED');
      
      // Notify user of approval
      notifyUser(req.params.userId, "USER_UPDATE", { status: "VERIFIED" });
      
      const roleText = user.role === 'ESCORT' ? "companion" : "client";
      const settingsUrl = user.role === 'ESCORT' ? "/partner-settings" : "/client-settings";

      await createAndNotify(
        req.params.userId,
        "verification",
        "Verification Approved",
        `Your ${roleText} profile has been verified!`,
        { url: settingsUrl }
      );
      
      res.json({ message: "Verification approved successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/verifications/:userId/reject", isAdmin, async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: "Rejection reason is required" });
      
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.updateVerificationStatus(req.params.userId, 'REJECTED', reason);
      
      // Notify user of rejection
      notifyUser(req.params.userId, "USER_UPDATE", { status: "REJECTED", reason });
      
      const settingsUrl = user.role === 'ESCORT' ? "/partner-settings" : "/client-settings";

      await createAndNotify(
        req.params.userId,
        "verification",
        "Verification Rejected",
        `Your verification was rejected: ${reason}`,
        { url: settingsUrl }
      );
      
      res.json({ message: "Verification rejected successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/disputes/:id/resolve", isAdmin, async (req, res) => {
    const { resolution } = req.body;
    if (!['REFUND', 'RELEASE'].includes(resolution)) {
      return res.status(400).send("Invalid resolution");
    }
    const dispute = await storage.resolveDispute(req.params.id, resolution);
    const booking = await storage.getBooking(dispute.bookingId);
    
    if (booking) {
      // Notify both parties of dispute resolution
      notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
      notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });
      
      const message = resolution === 'REFUND' ? "Refunded to client" : "Released to companion";
      await createAndNotify(
        booking.clientId,
        "dispute_resolved",
        "Dispute Resolved",
        `The dispute for booking #${booking.id.substring(0, 8)} has been resolved: ${message}.`,
        { bookingId: booking.id, url: "/dashboard" }
      );
      await createAndNotify(
        booking.escortId,
        "dispute_resolved",
        "Dispute Resolved",
        `The dispute for booking #${booking.id.substring(0, 8)} has been resolved: ${message}.`,
        { bookingId: booking.id, url: "/dashboard" }
      );
    }
    
    res.sendStatus(200);
  });

  app.post("/api/admin/broadcast", isAdmin, async (req, res) => {
    try {
      const { title, body, targetRole } = req.body;
      if (!title || !body) {
        return res.status(400).json({ message: "Title and body are required" });
      }

      const users = await storage.getAllUsers();
      const filteredUsers = targetRole 
        ? users.filter(u => u.role === targetRole)
        : users;

      console.log(`Starting broadcast: targetRole=${targetRole || 'ALL'}, userCount=${filteredUsers.length}`);

      const results = await Promise.all(filteredUsers.map(async (user) => {
        try {
          await createAndNotify(
            user.id,
            "news",
            title,
            body,
            { url: user.role === 'ESCORT' ? "/partner-settings" : "/client-settings" }
          );
          return { userId: user.id, success: true };
        } catch (err) {
          console.error(`Failed to broadcast to user ${user.id}:`, err);
          return { userId: user.id, success: false };
        }
      }));

      res.json({
        message: "Broadcast completed",
        total: filteredUsers.length,
        successCount: results.filter(r => r.success).length
      });
    } catch (error: any) {
      console.error("Broadcast error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/settings", isAdmin, async (req, res) => {
    try {
      console.log("PATCH /api/admin/settings - Body:", JSON.stringify(req.body, null, 2));
      const settings = await storage.updateAdminSettings(req.body);
      res.json(settings);
    } catch (error: any) {
      console.error("Admin settings update error:", error);
      res.status(500).json({ message: error.message || "Failed to update settings" });
    }
  });

  app.get("/api/admin/logs", isAdmin, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const logs = await storage.getAuditLogs(limit);
    res.json(logs);
  });

  app.get("/api/admin/payouts", isAdmin, async (_req, res) => {
    const payouts = await storage.getAllPayouts();
    const enrichedPayouts = await Promise.all(payouts.map(async (payout) => {
      const escort = await storage.getEscortById(payout.escortId);
      let escortName = "Unknown Companion";
      if (escort) {
        if (escort.firstName && escort.lastName) {
          escortName = `${escort.firstName} ${escort.lastName}`;
        } else {
          escortName = escort.displayName;
        }
      }
      return {
        ...payout,
        escortName
      };
    }));
    res.json(enrichedPayouts);
  });

  app.post("/api/admin/payouts/:id/retry", isAdmin, async (req, res) => {
    try {
      const payout = await storage.getPayout(req.params.id);
      if (!payout) return res.status(404).send("Payout not found");
      if (payout.status !== 'FAILED') return res.status(400).send("Only failed payouts can be retried");

      const booking = await storage.getBooking(payout.bookingId);
      if (!booking) return res.status(404).send("Booking not found");

      const recipient = await storage.getTransferRecipientByEscortId(payout.escortId);
      if (!recipient) return res.status(400).send("Escort has no transfer recipient setup");

      // Initiate Paystack Transfer
      const transferBody = {
        source: "balance",
        amount: Math.round(Number(payout.amount) * 100), // convert to kobo
        recipient: recipient.recipientCode,
        reason: `Retry payout for booking ${booking.id}`,
        reference: `payout_retry_${booking.id}_${Date.now()}`,
        currency: "NGN"
      };

      console.log(`Admin retrying payout ${payout.id} with body:`, JSON.stringify(transferBody));

      const transferRes = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transferBody),
      });

      const transferData = await transferRes.json();
      console.log("Paystack Retry Transfer Response:", JSON.stringify(transferData));

      if (!transferData.status) {
        console.error("Paystack Retry Payout Error:", transferData);
        await storage.updatePayout(payout.id, {
          status: "FAILED",
          transferReference: `failed_retry_${transferData.message || 'unknown'}_${randomUUID()}`.substring(0, 250)
        });
        return res.status(400).json({ message: transferData.message || "Retry failed" });
      }

      // Update payout record
      const updatedPayout = await storage.updatePayout(payout.id, {
        status: "PROCESSING",
        transferReference: transferData.data?.reference || `tr_retry_${randomUUID()}`
      });

      // Notify escort that payout is being retried
      notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });
      await createAndNotify(
        booking.escortId,
        "payout_retry",
        "Payout Retried",
        `Our admin has retried the payout for booking #${booking.id.substring(0, 8)}. Status: PROCESSING.`,
        { bookingId: booking.id, url: "/dashboard" }
      );

      res.json(updatedPayout);
    } catch (error: any) {
      console.error("Payout retry error:", error);
      res.status(500).send(error.message);
    }
  });

  // Admin Settings (Public read for fee calculation)
  app.get("/api/admin/settings", async (_req, res) => {
    const settings = await storage.getAdminSettings();
    res.json(settings);
  });

  // Booking Payment Routes
  app.post("/api/bookings/:id/pay", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).send("Booking not found");
      
      // @ts-ignore
      if (booking.clientId !== req.user.id) return res.status(403).send("Unauthorized");
      
      const amountInKobo = Number(booking.amount) * 100;

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // @ts-ignore
          email: req.user.email,
          amount: amountInKobo,
          callback_url: `${req.protocol}://${req.get("host")}/client-dashboard`,
          metadata: {
            bookingId: booking.id,
            type: "booking_payment"
          }
        }),
      });

      const data = await response.json();
      if (!data.status) throw new Error(data.message);
      res.json(data.data);
    } catch (error: any) {
      console.error("Paystack Booking Initialize Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bookings/verify-payment", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { reference } = req.body;

    if (!reference) return res.status(400).send("Reference required");

    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      });

      const data = await response.json();
      if (data.status && data.data.status === "success") {
        const bookingId = data.data.metadata.bookingId;
        const booking = await storage.getBooking(bookingId);
        
        if (booking && (booking.status === "ACCEPTED" || booking.status === "CREATED")) {
          await storage.updateBookingStatus(bookingId, "PAID");
          
          // Notify parties
          notifyUser(booking.clientId, "BOOKING_UPDATE", { bookingId: booking.id });
          notifyUser(booking.escortId, "BOOKING_UPDATE", { bookingId: booking.id });
        }
        
        res.json({ status: "success", bookingId });
      } else {
        res.status(400).json({ message: "Payment verification failed" });
      }
    } catch (error: any) {
      console.error("Paystack Booking Verify Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Verification Fee Routes
  app.post("/api/escort/pay-verification", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    // @ts-ignore
    if (req.user.role !== "ESCORT") return res.status(403).json({ message: "Forbidden" });

    try {
      const settings = await storage.getAdminSettings();
      const feeInNaira = Number(settings.verificationFee);
      const feeInKobo = feeInNaira * 100;

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // @ts-ignore
          email: req.user.email,
          amount: feeInKobo,
          callback_url: `${req.protocol}://${req.get("host")}/partner-settings`,
          metadata: {
            // @ts-ignore
            userId: req.user.id,
            type: "verification_fee"
          }
        }),
      });

      const data = await response.json();
      if (!data.status) throw new Error(data.message);
      res.json(data.data);
    } catch (error: any) {
      console.error("Paystack Initialize Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/escort/verify-verification", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ message: "Reference is required" });
    }

    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      });

      const data = await response.json();
      if (data.status && data.data.status === "success") {
        const settings = await storage.getAdminSettings();
        // @ts-ignore
        const userId = req.user.id;

        if (settings.requirePartnerApproval) {
          // If approval required, just mark fee paid and set status to PENDING
          const escort = await storage.getEscortById(userId);
          const currentDocs = (escort?.verificationDocs as any) || {};
          await storage.updateEscort(userId, { 
            verificationFeePaid: true,
            verificationDocs: { ...currentDocs, status: "PENDING" }
          });
          console.log(`Escort ${userId} paid verification fee. Status set to PENDING (Approval Required).`);
        } else {
          // Auto-verify if no approval required
          await storage.updateEscort(userId, { verificationFeePaid: true });
          await storage.updateVerificationStatus(userId, "VERIFIED");
          console.log(`Escort ${userId} paid verification fee. Auto-verified.`);
        }
        res.json({ status: "success" });
      } else {
        res.status(400).json({ message: "Payment verification failed" });
      }
    } catch (error: any) {
      console.error("Paystack Verify Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/user/location", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { lat, lng } = req.body;
    
    if (lat === undefined || lng === undefined) {
      return res.status(400).send("Latitude and longitude are required");
    }

    try {
      // @ts-ignore
      const userId = req.user.id;
      // @ts-ignore
      const userRole = req.user.role;

      // Update both User and Escort profile if applicable
      await storage.updateUser(userId, { latitude: lat.toString(), longitude: lng.toString() });
      
      if (userRole === 'ESCORT') {
        await storage.updateEscort(userId, { latitude: lat.toString(), longitude: lng.toString() });
      }

      res.sendStatus(200);
    } catch (error: any) {
      console.error("Update location error:", error);
      res.status(500).send(error.message);
    }
  });

  app.get("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const user = await storage.getUser(req.user.id);
    if (!user) return res.sendStatus(404);
    res.json(user);
  });

  app.patch("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const data = { ...req.body };
      // @ts-ignore
      const userId = req.user.id;

      const updated = await storage.updateUser(userId, data);
      
      // If user is an escort, also update escort profile if avatar or other fields match
      // @ts-ignore
      if (req.user.role === 'ESCORT') {
        const escortUpdate: any = {};
        if (data.avatar) escortUpdate.avatar = data.avatar;
        if (data.verificationDocs) escortUpdate.verificationDocs = data.verificationDocs;
        
        if (Object.keys(escortUpdate).length > 0) {
          await storage.updateEscort(userId, escortUpdate);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Update user profile error:", error);
      res.status(500).send(error.message);
    }
  });

  app.get("/api/escort/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const profile = await storage.getEscortById(req.user.id);
    if (!profile) return res.sendStatus(404);
    res.json(profile);
  });

  app.patch("/api/escort/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    if (req.user.role !== "ESCORT") return res.sendStatus(403);

    try {
      const data = { ...req.body };
      if (typeof data.dateOfBirth === 'string') {
        data.dateOfBirth = new Date(data.dateOfBirth);
      }

      // @ts-ignore
      const updated = await storage.updateEscort(req.user.id, data);
      
      // Also update user avatar if provided
      if (data.avatar) {
        // @ts-ignore
        await storage.updateUser(req.user.id, { avatar: data.avatar });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(400).send(error.message);
    }
  });

  // Messaging Routes
  app.get("/api/messages/chats", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const userId = req.user.id;
    const chats = await storage.getUserChats(userId);
    
    // Enrich chats with user details
    const enrichedChats = await Promise.all(chats.map(async (chat) => {
      const otherUser = await storage.getUser(chat.userId);
      const escort = await storage.getEscortById(chat.userId);
      const userName = escort?.displayName || 
        (otherUser ? (otherUser.firstName && otherUser.lastName ? `${otherUser.firstName} ${otherUser.lastName}` : (otherUser.firstName || otherUser.email)) : "Unknown User");
      
      return {
        ...chat,
        userName,
        userAvatar: escort?.avatar || otherUser?.avatar || null,
      };
    }));

    res.json(enrichedChats);
  });

  app.get("/api/messages/:otherId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const userId = req.user.id;
    const otherId = req.params.otherId;
    
    // Mark as read when messages are fetched
    await storage.markMessagesAsRead(userId, otherId);
    
    // Notify the other user (the sender) that their messages have been read
    const socketId = clients.get(otherId);
    if (socketId) {
      io.to(socketId).emit("messages_read", {
        readerId: userId,
        senderId: otherId
      });
    }
    
    // Check if chat is allowed
    const allowed = await storage.hasActiveBooking(userId, otherId);
    if (!allowed) {
      // Still allow viewing history, but frontend should block sending
      // Actually, user says "messaging deactivates", so maybe we shouldn't even show messages?
      // "messaging deactivates" usually means you can't send new messages.
      // Let's return the messages but include the allowed flag.
    }

    const messages = await storage.getMessages(userId, otherId);
    res.json(messages);
  });

  app.get("/api/messages/allowed/:otherId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const userId = req.user.id;
    const otherId = req.params.otherId;
    const allowed = await storage.hasActiveBooking(userId, otherId);
    res.json({ allowed });
  });

  app.post("/api/escort/recipient", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    if (req.user.role !== "ESCORT") return res.sendStatus(403);

    // Enforce verification fee before bank setup
    // @ts-ignore
    const escortProfile = await storage.getEscortById(req.user.id);
    if (!escortProfile?.verificationFeePaid) {
        return res.status(403).send("You must pay the non-refundable verification fee before setting up your payout account.");
    }

    const { accountNumber, bankName, bankCode } = req.body;
    
    try {
      // 1. Resolve Account first to be sure
      const resolveRes = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      });
      const resolveData = await resolveRes.json();
      
      if (!resolveData.status) {
        return res.status(400).send("Could not resolve account details");
      }

      // 2. Create Transfer Recipient on Paystack
      const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "nuban",
          name: resolveData.data.account_name,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: "NGN",
        }),
      });
      
      const recipientData = await recipientRes.json();
      
      if (!recipientData.status) {
        throw new Error(recipientData.message || "Failed to create transfer recipient");
      }

      // 3. Save to our database
      // @ts-ignore
      const recipient = await storage.upsertTransferRecipient(req.user.id, {
        recipientCode: recipientData.data.recipient_code,
        bankName,
      });

      res.json(recipient);
    } catch (error: any) {
      console.error("Paystack Recipient Error:", error);
      res.status(500).send(error.message);
    }
  });

  app.patch("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    // @ts-ignore
    const updatedUser = await storage.updateUser(req.user.id, parsed.data);
    
    // Update session user to reflect changes immediately
    // @ts-ignore
    req.login(updatedUser, (err) => {
        if (err) return res.status(500).send(err);
        res.json(updatedUser);
    });
  });

  app.post("/api/user/password", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const { currentPassword, newPassword } = req.body;
    // @ts-ignore
    const user = req.user;

    if (!(await comparePasswords(currentPassword, user.passwordHash))) {
      return res.status(400).send("Incorrect current password");
    }

    const passwordHash = await hashPassword(newPassword);
    await storage.updateUser(user.id, { passwordHash });
    
    res.sendStatus(200);
  });

  // API Routes
  app.get("/api/dashboard/client", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // @ts-ignore
    const bookings = await storage.getBookingsByClientId(req.user.id);
    
    // Enrich bookings with escort details
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const escort = await storage.getEscortById(booking.escortId);
        const reviews = await storage.getReviewsByBookingId(booking.id);
        return {
            ...booking,
            escortName: escort?.displayName || "Unknown",
            escortImage: "blurred", // Mock
            escortAvatar: escort?.avatar || null,
            clientReviewed: reviews.some(r => r.reviewerId === (req.user as any).id),
            escortReviewed: reviews.some(r => r.reviewerId === booking.escortId),
        };
    }));

    // @ts-ignore
    const escrowBalance = await storage.getEscrowBalance(req.user.id);
    
    res.json({
        bookings: enrichedBookings,
        escrowBalance,
        stats: {
            totalBookings: bookings.length,
            completedBookings: bookings.filter(b => b.status === 'COMPLETED').length,
        }
    });
  });

  app.get("/api/dashboard/escort", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      // @ts-ignore
      const bookings = await storage.getBookingsByEscortId(req.user.id);
      const settings = await storage.getAdminSettings();
      const platformFeeRate = Number(settings.platformFeeRate || 0.25);

      // Enrich bookings with client details
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const client = await storage.getUser(booking.clientId);
        const clientName = client ? (client.firstName && client.lastName ? `${client.firstName} ${client.lastName}` : (client.firstName || client.email)) : "Unknown Client";
        const reviews = await storage.getReviewsByBookingId(booking.id);
        return {
            ...booking,
            clientName,
            clientAvatar: client?.avatar || null,
            escortReviewed: reviews.some(r => r.reviewerId === (req.user as any).id),
            clientReviewed: reviews.some(r => r.reviewerId === booking.clientId),
        };
      }));
      
      // Calculate earnings from real payouts
      const payouts = await storage.getPayoutsByEscortId((req.user as any).id);
      
      const totalEarnings = payouts
        .filter(p => p.status === 'SUCCESS')
        .reduce((acc, p) => acc + Number(p.amount), 0);

      const pendingPayouts = bookings
        .filter(b => {
          // A booking is pending payout if it's PAID or later, but hasn't been successfully paid out yet
          const hasSuccessfulPayout = payouts.some(p => p.bookingId === b.id && p.status === 'SUCCESS');
          const isEligibleStatus = ['PAID', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_CONFIRMED'].includes(b.status);
          return isEligibleStatus && !hasSuccessfulPayout;
        })
        .reduce((acc, b) => acc + (Number(b.amount) * (1 - Number(b.commissionRate || platformFeeRate))), 0);

      // @ts-ignore
      const profile = await storage.getEscortById(req.user.id);

      res.json({
          bookings: enrichedBookings,
          payouts,
          platformFeeRate,
          stats: {
              totalEarnings,
              pendingPayouts,
              profileViews: profile?.profileViews || 0,
          }
      });
  });

  return httpServer;
}
