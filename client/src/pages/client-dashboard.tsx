import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Clock, 
  Settings,
  Wallet,
  ShieldCheck,
  MessageSquare,
  CheckCircle2,
  Loader2,
  AlertCircle,
  History,
  CreditCard,
  Star,
  ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import blurredProfile from "@/assets/generated_images/blurred_portrait_of_a_person_for_privacy.png";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { PaymentModal } from "@/components/payment-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ReviewDialog } from "@/components/review-dialog";
import { SosButton } from "@/components/sos-button";

export default function ClientDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [bookingToCancel, setBookingToCancel] = useState<any>(null);
  const [disputeBooking, setDisputeBooking] = useState<any>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [bookingToReview, setBookingToReview] = useState<any>(null);

  // Handle Paystack callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    
    if (reference) {
      // Clear reference from URL without refresh
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const verifyPayment = async () => {
        try {
          const res = await apiRequest("POST", "/api/bookings/verify-payment", { reference });
          if (res.ok) {
            toast({
              title: "Payment Verified",
              description: "Your booking is now active.",
            });
            // Force immediate refetch of all relevant queries
            await queryClient.refetchQueries({ queryKey: ["/api/dashboard/client"] });
            await queryClient.refetchQueries({ queryKey: ["/api/messages/allowed/all"] });
          } else {
            const data = await res.json();
            throw new Error(data.message || "Payment verification failed");
          }
        } catch (err: any) {
          toast({
            title: "Payment Error",
            description: err.message,
            variant: "destructive",
          });
        }
      };
      
      verifyPayment();
    }
  }, [toast, queryClient]);

  // Real-time updates via Socket.io
  useEffect(() => {
    if (!user) return;

    const socket = io(window.location.origin, {
      path: "/ws",
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.emit("auth", { type: "auth", userId: user.id });
    });

    socket.on("BOOKING_UPDATE", (data: any) => {
      queryClient.refetchQueries({ queryKey: ["/api/dashboard/client"] });
      queryClient.refetchQueries({ queryKey: ["/api/messages/allowed/all"] });
      toast({
        title: "Dashboard Updated",
        description: "A booking status has changed.",
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [user, queryClient, toast]);
  
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["/api/dashboard/client"],
    enabled: !!user
  });

  const { data: chatsAllowed } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/messages/allowed/all"],
    enabled: !!user && !!dashboardData?.bookings,
    queryFn: async () => {
      const results: Record<string, boolean> = {};
      if (!dashboardData?.bookings) return results;
      
      await Promise.all(dashboardData.bookings.map(async (b: any) => {
        const res = await apiRequest("GET", `/api/messages/allowed/${b.escortId}`);
        const data = await res.json();
        results[b.escortId] = data.allowed;
      }));
      return results;
    }
  });

  const updateStatusMutation = useMutation({
      mutationFn: async ({ id, status }: { id: string, status: string }) => {
          const res = await apiRequest("PATCH", `/api/bookings/${id}/status`, { status });
          return await res.json();
      },
      onSuccess: (data, variables) => {
          queryClient.refetchQueries({ queryKey: ["/api/dashboard/client"] });
          if (variables.status === "COMPLETED_CONFIRMED") {
            if (data.payoutError) {
              toast({ 
                title: "Booking Confirmed", 
                description: `Confirmed, but payout failed: ${data.payoutError}. Admin will investigate.`,
                variant: "destructive"
              });
            } else if (data.payoutDelayed) {
              toast({ 
                title: "Booking Confirmed", 
                description: "Confirmed, but payout is delayed due to 24h bank change cooldown.",
              });
            } else if (data.payoutPaused) {
              toast({ 
                title: "Booking Confirmed", 
                description: "Confirmed, but payouts are currently paused by admin.",
              });
            } else {
              toast({ title: "Booking Confirmed", description: "Service completed. Funds released to escort." });
            }
          } else if (variables.status === "PAID") {
            toast({ title: "Payment Successful", description: "Your booking is now active." });
            setShowPaymentModal(false);
          } else if (variables.status === "CANCELLED") {
            toast({ title: "Booking Cancelled", description: "The booking has been cancelled successfully." });
          } else {
            toast({ title: "Booking Updated" });
          }
      },
      onError: (error: Error) => {
          toast({
              title: "Update Failed",
              description: error.message,
              variant: "destructive"
          });
      }
  });

  const disputeMutation = useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: string, reason: string }) => {
      const res = await apiRequest("POST", "/api/disputes", { bookingId, reason });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/client"] });
      toast({ title: "Dispute Raised", description: "Our team will review your case." });
    }
  });

  const handlePaymentSuccess = () => {
    if (selectedBooking) {
      updateStatusMutation.mutate({ id: selectedBooking.id, status: "PAID" });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-white/20" />
        </div>
      </Layout>
    );
  }

  const activeBookings = dashboardData?.bookings?.filter((b: any) => 
    ['CREATED', 'ACCEPTED', 'PAID', 'IN_PROGRESS'].includes(b.status)
  ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || [];

  const historyBookings = dashboardData?.bookings?.filter((b: any) => 
    ['COMPLETED', 'COMPLETED_CONFIRMED', 'CANCELLED', 'DISPUTED', 'PAYOUT_INITIATED', 'PAID_OUT'].includes(b.status)
  ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || [];

  return (
    <Layout>
      <SosButton />
      <div className="max-w-5xl mx-auto space-y-8 pb-8">
        <div className="flex items-center mb-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white -ml-2 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Discover
            </Button>
          </Link>
        </div>
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-secondary flex items-center justify-center border border-white/5">
              {user?.avatar ? (
                <img src={user.avatar} className="w-full h-full object-cover" alt="Profile" />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {(user?.firstName || user?.email || "U").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                 Welcome, {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : (user?.firstName || user?.email)}
              </h1>
              <div className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                <Badge variant="outline" className="bg-white/5 border-white/10 text-xs font-normal">{user?.role}</Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
             <Link href="/profile">
               <Button variant="outline" className="border-white/10 hover:bg-white/5 text-muted-foreground">
                 <Settings className="w-4 h-4 mr-2" />
                 Account Settings
               </Button>
             </Link>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/40 border-white/5">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground font-medium mb-1">Escrow Balance</div>
              <div className="text-xl font-bold text-white">₦{dashboardData?.escrowBalance || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-white/5">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground font-medium mb-1">Total Bookings</div>
              <div className="text-xl font-bold text-white">{dashboardData?.stats?.totalBookings || 0}</div>
            </CardContent>
          </Card>
          {/* ... other stats ... */}
        </div>

        <Tabs defaultValue="active" className="w-full">
          <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="bg-secondary/30 border border-white/5 p-1 mb-6 w-max sm:w-auto justify-start">
              <TabsTrigger value="active" className="flex-shrink-0">Current Activity</TabsTrigger>
              <TabsTrigger value="history" className="flex-shrink-0">Booking History</TabsTrigger>
              <TabsTrigger value="wallet" className="flex-shrink-0">Wallet & Payouts</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="active" className="space-y-6">
            {activeBookings.length === 0 && (
                <div className="text-center py-10 text-muted-foreground bg-card/20 rounded-2xl border border-white/5">
                    <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>No active bookings at the moment.</p>
                    <Link href="/">
                      <Button variant="link" className="text-blue-400 mt-2">Find a companion</Button>
                    </Link>
                </div>
            )}
            
            {activeBookings.map((booking: any) => (
                <Card key={booking.id} className={`border-l-4 ${booking.status === 'PAID' ? 'border-l-green-500' : 'border-l-blue-500'} border-t-white/5 border-r-white/5 border-b-white/5 bg-card/40 backdrop-blur-md overflow-hidden transition-all hover:bg-card/50`}>
                   <div className="p-4 md:p-6">
                     <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                        <div className="space-y-1">
                            <div className="flex flex-col items-start gap-2 mb-2">
                               <div className="flex items-center gap-2">
                                 <Badge variant="outline" className={`${['PAID', 'IN_PROGRESS', 'COMPLETED_CONFIRMED', 'PAYOUT_INITIATED', 'PAID_OUT'].includes(booking.status) ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                   <Clock className="w-3 h-3 mr-1 animate-pulse" />
                                   {booking.status === 'PAYOUT_INITIATED' ? 'Payout Processing' : booking.status.replace(/_/g, ' ')}
                                 </Badge>
                                 {['PAID', 'IN_PROGRESS', 'COMPLETED_CONFIRMED', 'PAYOUT_INITIATED'].includes(booking.status) && (
                                   <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                                     <ShieldCheck className="w-3 h-3 mr-1" />
                                     Escrow Active
                                   </Badge>
                                 )}
                               </div>
                               <p className="text-sm text-muted-foreground">
                                   Created on {format(new Date(booking.createdAt), "PPP")}
                               </p>
                            </div>
                            <CardTitle className="text-xl text-white">Booking with {booking.escortName}</CardTitle>
                        </div>
                        <div className="text-left md:text-right">
                           <div className="text-2xl font-bold text-white">₦{Number(booking.amount).toLocaleString()}</div>
                           <div className="text-xs text-muted-foreground flex items-center md:justify-end gap-1">
                              <ShieldCheck className="w-3 h-3 text-blue-400" /> 
                              {booking.status === 'PAID' || booking.status === 'IN_PROGRESS' ? 'Held in Escrow' : 'Payment Required'}
                           </div>
                        </div>
                     </div>
    
                     <div className="flex items-center gap-4 py-4 border-t border-white/5">
                        <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 shrink-0">
                           <img src={booking.escortAvatar || blurredProfile} className={`w-full h-full object-cover ${!booking.escortAvatar ? "blur-[2px]" : ""}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                           <div className="text-sm text-white font-medium flex items-center justify-between">
                              <span>Progress</span>
                              <span className="text-xs text-muted-foreground">
                                  {['COMPLETED_CONFIRMED', 'PAYOUT_INITIATED', 'PAID_OUT'].includes(booking.status) ? '100%' : booking.status === 'IN_PROGRESS' ? '75%' : booking.status === 'PAID' ? '50%' : '25%'}
                              </span>
                           </div>
                           <Progress 
                                value={['COMPLETED_CONFIRMED', 'PAYOUT_INITIATED', 'PAID_OUT'].includes(booking.status) ? 100 : booking.status === 'IN_PROGRESS' ? 75 : booking.status === 'PAID' ? 50 : 25} 
                                className="h-1.5 mt-2 bg-white/5" 
                           />
                        </div>
                     </div>
    
                     <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs text-blue-200/60 leading-relaxed">
                       {booking.status === 'CREATED' && "Wait for the companion to accept the request."}
                       {booking.status === 'ACCEPTED' && "Request accepted. Proceed to payment to activate messaging and service."}
                       {booking.status === 'PAID' && "Payment confirmed. Messaging activated. Waiting for companion to start the service."}
                       {booking.status === 'IN_PROGRESS' && "Service in progress. Please confirm completion once the meeting is over."}
                       {booking.status === 'COMPLETED_CONFIRMED' && "Completion confirmed. Payout is being processed."}
                       {booking.status === 'PAYOUT_INITIATED' && "Payout initiated and processing via our payment service."}
                       {booking.status === 'PAID_OUT' && "Booking finalized. Payout successfully sent to the companion."}
                     </div>
    
                     <div className="mt-6 flex flex-col md:flex-row gap-3">
                        {chatsAllowed?.[booking.escortId] ? (
                          <Link href={`/messages/${booking.escortId}`} className="flex-1">
                            <Button variant="outline" className="w-full border-white/10 hover:bg-white/5 text-muted-foreground h-12">
                               <MessageSquare className="w-4 h-4 mr-2" />
                               Chat with {booking.escortName}
                            </Button>
                          </Link>
                        ) : (
                          <Button variant="outline" disabled className="flex-1 border-white/10 opacity-50 text-muted-foreground h-12 cursor-not-allowed">
                             <MessageSquare className="w-4 h-4 mr-2" />
                             Chat Deactivated
                          </Button>
                        )}

                        {booking.status === 'ACCEPTED' && (
                          <Button 
                            className="flex-1 bg-white text-black hover:bg-white/90 h-12 font-bold"
                            onClick={() => {
                              setSelectedBooking(booking);
                              setShowPaymentModal(true);
                            }}
                          >
                            <CreditCard className="w-4 h-4 mr-2" />
                            Pay to Activate
                          </Button>
                        )}

                        {(booking.status === 'CREATED' || booking.status === 'ACCEPTED') && (
                          <Button 
                            variant="outline"
                            className="flex-1 border-white/10 hover:bg-red-500/10 hover:text-red-400 text-muted-foreground h-12"
                            onClick={() => setBookingToCancel(booking)}
                          >
                            Cancel Booking
                          </Button>
                        )}

                        {booking.status === 'IN_PROGRESS' && (
                          <>
                            <Button 
                                className="flex-[2] bg-green-600 hover:bg-green-700 text-white border-none h-12 font-bold shadow-lg shadow-green-900/20"
                                onClick={() => updateStatusMutation.mutate({ id: booking.id, status: 'COMPLETED_CONFIRMED' })}
                                disabled={updateStatusMutation.isPending}
                            >
                               {updateStatusMutation.isPending ? <Loader2 className="animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm & Release Payout</>}
                            </Button>
                            <Button 
                                variant="outline"
                                className="flex-1 border-red-500/20 hover:bg-red-500/10 text-red-400 h-12"
                                onClick={() => setDisputeBooking(booking)}
                            >
                               <AlertCircle className="w-4 h-4 mr-2" /> Dispute
                            </Button>
                          </>
                        )}
                     </div>
                   </div>
                </Card>
            ))}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            {historyBookings.length === 0 && (
                <div className="text-center py-10 text-muted-foreground bg-card/20 rounded-2xl border border-white/5">
                    <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>No booking history found.</p>
                </div>
            )}
            
            {historyBookings.map((booking: any) => (
                <Card key={booking.id} className="border-white/5 bg-card/40 backdrop-blur-md overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                   <div className="p-4 md:p-6">
                     <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex flex-col items-start gap-2 mb-2">
                               <div className="flex items-center gap-2">
                                 <Badge variant="outline" className={`${(booking.status.includes('COMPLETED') || booking.status === 'PAID_OUT' || booking.status === 'PAYOUT_INITIATED') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'} border-white/5`}>
                                   {booking.status.replace(/_/g, ' ')}
                                 </Badge>
                                 {!booking.clientReviewed && (booking.status === 'COMPLETED_CONFIRMED' || booking.status === 'PAID_OUT' || booking.status === 'PAYOUT_INITIATED') && (
                                   <Button 
                                     size="sm" 
                                     className="h-7 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-[10px] px-2"
                                     onClick={() => setBookingToReview(booking)}
                                   >
                                     <Star className="w-3 h-3 mr-1 fill-current" /> Rate Escort
                                   </Button>
                                 )}
                                 {booking.clientReviewed && (
                                   <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px]">
                                     <Star className="w-3 h-3 mr-1 fill-current" /> Reviewed
                                   </Badge>
                                 )}
                               </div>
                               <p className="text-xs text-muted-foreground">
                                   Completed on {format(new Date(booking.completedAt || booking.createdAt), "PPP")}
                               </p>
                            </div>
                            <CardTitle className="text-lg text-white">Booking with {booking.escortName}</CardTitle>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                           <div className="text-xl font-bold text-white">₦{Number(booking.amount).toLocaleString()}</div>
                        </div>
                     </div>
                   </div>
                </Card>
            ))}
          </TabsContent>
          
          <TabsContent value="wallet" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-gradient-to-br from-secondary/50 to-card border-white/5 p-6 space-y-4">
                   <div className="flex justify-between items-center">
                      <Wallet className="w-8 h-8 text-white/80" />
                      <Badge className="bg-white text-black">Active Wallet</Badge>
                   </div>
                   <div>
                      <div className="text-sm text-muted-foreground">Escrow Balance (Held)</div>
                      <div className="text-3xl font-bold text-white">₦{dashboardData?.escrowBalance || 0}</div>
                      <p className="text-[10px] text-muted-foreground mt-2">Funds are held in escrow until you confirm completion.</p>
                   </div>
                </Card>
             </div>
          </TabsContent>
        </Tabs>
      </div>

      <PaymentModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={() => {
          setShowPaymentModal(false);
          handlePaymentSuccess();
        }}
        amount={selectedBooking ? Number(selectedBooking.amount) : 0}
        email={user?.email || ""}
        clientName={user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : (user?.firstName || user?.email)}
        bookingId={selectedBooking?.id}
        escortName={selectedBooking?.escortName}
      />

      <AlertDialog open={!!bookingToCancel} onOpenChange={(open) => !open && setBookingToCancel(null)}>
        <AlertDialogContent className="bg-card border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to cancel this booking? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">No, keep it</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (bookingToCancel) {
                  updateStatusMutation.mutate({ id: bookingToCancel.id, status: 'CANCELLED' });
                  setBookingToCancel(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white border-none"
            >
              Yes, cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!disputeBooking} onOpenChange={(open) => {
        if (!open) {
          setDisputeBooking(null);
          setDisputeReason("");
        }
      }}>
        <DialogContent className="bg-card border-white/10 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Dispute Booking</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for dispute</Label>
              <Textarea 
                id="reason"
                placeholder="Please describe why you are disputing this booking..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="bg-white/5 border-white/10 text-white min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDisputeBooking(null)}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (disputeBooking && disputeReason) {
                  disputeMutation.mutate({ bookingId: disputeBooking.id, reason: disputeReason });
                  setDisputeBooking(null);
                  setDisputeReason("");
                }
              }}
              disabled={!disputeReason || disputeMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white border-none"
            >
              {disputeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReviewDialog 
        isOpen={!!bookingToReview}
        onClose={() => setBookingToReview(null)}
        bookingId={bookingToReview?.id}
        revieweeId={bookingToReview?.escortId}
        revieweeName={bookingToReview?.escortName}
      />
    </Layout>

  );
}
