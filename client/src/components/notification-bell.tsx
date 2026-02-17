import { Bell, Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/use-notifications";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    isLoading,
    pushSupported,
    pushSubscribed,
    requestPushPermission
  } = useNotifications();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleEnablePush = async () => {
    const success = await requestPushPermission();
    if (success) {
      toast({
        title: "Push Notifications Enabled",
        description: "You will now receive alerts even when the app is closed.",
      });
    } else {
      toast({
        title: "Permission Denied",
        description: "Please enable notification permissions in your browser settings.",
        variant: "destructive",
      });
    }
  };

  const getNotificationLink = (notification: any) => {
    // Priority 1: Check if there's an explicit URL in the notification data
    if (notification.data?.url) {
      return notification.data.url;
    }

    // Priority 2: Fallback to type-based routing
    switch (notification.type) {
      case "message":
        return `/messages/${notification.data?.senderId || ""}`;
      case "booking_request":
      case "booking_update":
      case "booking_confirmed":
      case "booking_cancelled":
      case "booking_completed":
      case "dispute":
        return "/dashboard";
      case "NEW_REVIEW":
        return "/dashboard";
      case "USER_UPDATE":
        return notification.data?.status === "VERIFIED" ? "/dashboard" : "/partner-settings";
      default:
        return null;
    }
  };

  const NotificationList = () => (
    <div className="flex flex-col w-full overflow-hidden">
      {notifications.map((notification) => {
        const link = getNotificationLink(notification);
        const content = (
          <div
            className={cn(
              "flex flex-col gap-1 p-4 border-b border-white/5 transition-colors w-full",
              link && "hover:bg-white/5 cursor-pointer",
              !notification.isRead && "bg-primary/5"
            )}
          >
            <div className="flex items-start justify-between gap-2 w-full overflow-hidden">
              <span className="font-medium text-sm leading-tight break-words flex-1 min-w-0">
                {notification.title}
              </span>
              {!notification.isRead && (
                <div className="w-2 h-2 rounded-full bg-primary mt-1 shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3 break-words w-full overflow-hidden">
              {notification.body}
            </p>
            <span className="text-[10px] text-muted-foreground/60 mt-1">
              {format(new Date(notification.createdAt), "MMM d, h:mm a")}
            </span>
          </div>
        );

        return (
          <div 
            key={notification.id} 
            onClick={() => {
              if (!notification.isRead) {
                markAsRead(notification.id);
              }
              if (link) {
                setLocation(link);
              }
            }}
          >
            {content}
          </div>
        );
      })}
      
      {notifications.length > 0 && (
        <div 
          onClick={() => setLocation("/notifications")}
          className="p-3 text-xs font-medium text-center text-primary hover:bg-primary/5 transition-colors border-t border-white/5 block cursor-pointer"
        >
          View All Notifications
        </div>
      )}
    </div>
  );

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative text-muted-foreground hover:text-white hover:bg-white/5"
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <Badge
          className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-primary text-primary-foreground border-2 border-background"
          variant="default"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </Badge>
      )}
    </Button>
  );

  const NotificationHeader = ({ title }: { title: string }) => (
    <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        {pushSupported && !pushSubscribed && (
          <button
            onClick={handleEnablePush}
            className="text-[10px] text-primary hover:underline text-left"
          >
            Enable push notifications
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8 hover:text-primary"
            onClick={() => markAllAsRead()}
          >
            Mark all as read
          </Button>
        )}
        {isMobile && (
          <DrawerClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          {trigger}
        </DrawerTrigger>
        <DrawerContent className="bg-background border-t-white/10 max-h-[85vh]">
          <DrawerHeader className="p-0">
            <NotificationHeader title="Notifications" />
          </DrawerHeader>
          <ScrollArea className="flex-1 overflow-y-auto pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 gap-2">
                <Bell className="w-10 h-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <NotificationList />
            )}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-background border-white/10 overflow-hidden" align="end">
        <NotificationHeader title="Notifications" />
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Bell className="w-8 h-8 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <NotificationList />
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
