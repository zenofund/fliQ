import { Bell, Trash2, Archive, CheckCircle2, Inbox, ArrowRight } from "lucide-react";
import Layout from "@/components/layout";
import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Spinner } from "@/components/ui/spinner";

export default function NotificationCenter() {
  const { 
    notifications, 
    isLoading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification, 
    archiveNotification,
    unreadCount
  } = useNotifications();

  const getNotificationLink = (notification: any) => {
    if (notification.data?.url) return notification.data.url;
    
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

  return (
    <Layout>
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Notification Center</h1>
            <p className="text-muted-foreground mt-1">Manage your alerts and system updates.</p>
          </div>
          
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => markAllAsRead()}
                className="border-white/10 hover:bg-white/5"
              >
                <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                Mark all as read
              </Button>
            )}
          </div>
        </div>

        <Card className="border-white/5 bg-card/20 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Recent Notifications</CardTitle>
                {unreadCount > 0 && (
                  <Badge variant="default" className="bg-primary text-primary-foreground">
                    {unreadCount} New
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Spinner className="w-8 h-8 text-primary" />
                <p className="text-sm text-muted-foreground">Fetching your notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                  <Inbox className="w-8 h-8 text-muted-foreground/20" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">All caught up!</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    You don't have any active notifications right now.
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="divide-y divide-white/5">
                  {notifications.map((notification) => {
                    const link = getNotificationLink(notification);
                    return (
                      <div 
                        key={notification.id}
                        className={cn(
                          "group flex flex-col md:flex-row items-start gap-3 md:gap-4 p-4 md:p-6 transition-all hover:bg-white/[0.02]",
                          !notification.isRead && "bg-primary/[0.03]"
                        )}
                      >
                        <div className="flex items-start gap-4 w-full">
                          <div className="mt-1 shrink-0">
                            <div className={cn(
                              "w-2.5 h-2.5 rounded-full",
                              notification.isRead ? "bg-white/10" : "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]"
                            )} />
                          </div>

                          <div className="flex-1 min-w-0 pr-0 md:pr-2">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-1 md:gap-4 mb-1">
                              <h4 className={cn(
                                "text-sm font-semibold leading-tight break-words",
                                notification.isRead ? "text-white/70" : "text-white"
                              )}>
                                {notification.title}
                              </h4>
                              <span className="text-[11px] md:text-xs text-muted-foreground shrink-0">
                                {format(new Date(notification.createdAt), "MMM d, h:mm a")}
                              </span>
                            </div>
                            
                            <p className="text-sm text-muted-foreground mb-3 leading-relaxed break-words w-full">
                              {notification.body}
                            </p>

                            <div className="flex flex-wrap items-center gap-3">
                            {link && (
                              <Link href={link}>
                                <span 
                                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
                                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                                >
                                  View Details
                                  <ArrowRight className="w-3 h-3" />
                                </span>
                              </Link>
                            )}
                            {!notification.isRead && !link && (
                              <button 
                                onClick={() => markAsRead(notification.id)}
                                className="text-xs font-medium text-white/40 hover:text-white transition-colors"
                              >
                                Mark as read
                              </button>
                            )}
                          </div>
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity mt-2 md:mt-0 self-end md:self-start">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/5"
                            onClick={() => archiveNotification(notification.id)}
                            title="Archive"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteNotification(notification.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
