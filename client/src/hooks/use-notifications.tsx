import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@shared/schema";
import { useAuth } from "./use-auth";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";
import { io, Socket } from "socket.io-client";

type NotificationContextType = {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  pushSupported: boolean;
  pushSubscribed: boolean;
  requestPushPermission: () => Promise<boolean>;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setPushSubscribed(!!subscription);
  };

  const requestPushPermission = async () => {
    if (!pushSupported) return false;

    try {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          console.error("VITE_VAPID_PUBLIC_KEY is not defined in environment variables");
          toast({
            title: "Notification Error",
            description: "Push notifications are not correctly configured.",
            variant: "destructive",
          });
          return false;
        }
        
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        const newSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });

        // Send subscription to server
        const key = newSubscription.getKey("p256dh");
        const auth = newSubscription.getKey("auth");

        await apiRequest("POST", "/api/push/subscribe", {
          endpoint: newSubscription.endpoint,
          p256dh: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : "",
          auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : "",
        });
      }

      setPushSubscribed(true);
      return true;
    } catch (err) {
      console.error("Failed to subscribe to push notifications:", err);
      return false;
    }
  };

  const { data: notificationsData = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  const notifications = [...notificationsData].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
  });

  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    if (!user) return;

    const newSocket = io(window.location.origin, {
      path: "/ws",
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ["websocket"],
    });

    newSocket.on("connect", () => {
      newSocket.emit("auth", { type: "auth", userId: user.id });
    });

    newSocket.on("notification", (data: any) => {
      // Invalidate queries to fetch fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      
      // Show toast for the new notification
      toast({
        title: data.notification.title,
        description: data.notification.body,
      });
    });

    newSocket.on("USER_UPDATE", (data: any) => {
      // Invalidate user query to reflect verification status changes
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      if (data.status === "VERIFIED") {
        toast({
          title: "Account Verified",
          description: "Your partner profile has been approved!",
        });
      } else if (data.status === "REJECTED") {
        toast({
          title: "Verification Rejected",
          description: data.reason || "Please check your email for details.",
          variant: "destructive",
        });
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user, queryClient, toast]);

  const markAsRead = async (id: string) => {
    if (!id) {
      console.warn("Attempted to mark notification as read without an ID");
      return;
    }
    try {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiRequest("PATCH", "/api/notifications/read-all");
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/notifications/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Notification deleted",
        description: "The notification has been removed.",
      });
    } catch (err) {
      console.error("Failed to delete notification:", err);
      toast({
        title: "Error",
        description: "Failed to delete notification.",
        variant: "destructive",
      });
    }
  };

  const archiveNotification = async (id: string) => {
    try {
      await apiRequest("PATCH", `/api/notifications/${id}/archive`);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Notification archived",
        description: "The notification has been moved to archive.",
      });
    } catch (err) {
      console.error("Failed to archive notification:", err);
      toast({
        title: "Error",
        description: "Failed to archive notification.",
        variant: "destructive",
      });
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        markAllAsRead,
      deleteNotification,
      archiveNotification,
      pushSupported,
      pushSubscribed,
      requestPushPermission,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
