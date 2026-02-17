import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { DollarSign, Users, Clock, Loader2, ShieldCheck, AlertTriangle, MessageSquare, Star, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { ReviewDialog } from "@/components/review-dialog";
import { SosButton } from "@/components/sos-button";
import { io, Socket } from "socket.io-client";

export default function EscortDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [bookingToReview, setBookingToReview] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Real-time updates via Socket.io
  useEffect(() => {
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

    newSocket.on("BOOKING_UPDATE", (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/escort"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/allowed/all/escort"] });
      toast({
        title: "Dashboard Updated",
        description: "A booking status has changed.",
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user, queryClient, toast]);

  const { data: dashboardData, isLoading } = useQuery({
      queryKey: ["/api/dashboard/escort"],
      enabled: !!user,
      refetchOnMount: true,
  });

  const { data: payouts } = useQuery({
    queryKey: ["/api/payouts"],
    enabled: !!user
  });

  const { data: escortProfile } = useQuery({
    queryKey: ["/api/escort/profile"],
    enabled: !!user
  });

  const { data: chatsAllowed } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/messages/allowed/all/escort"],
    enabled: !!user && !!dashboardData?.bookings,
    queryFn: async () => {
      const results: Record<string, boolean> = {};
      if (!dashboardData?.bookings) return results;
      
      await Promise.all(dashboardData.bookings.map(async (b: any) => {
        const res = await apiRequest("GET", `/api/messages/allowed/${b.clientId}`);
        const data = await res.json();
        results[b.clientId] = data.allowed;
      }));
      return results;
    }
  });

  const { data: currentRecipient } = useQuery({
    queryKey: ["/api/escort/recipient"],
    enabled: !!user
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/escort/profile", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escorts"] }); // Invalidate discovery list
      toast({ title: "Profile Updated" });
    }
  });

  const updateStatusMutation = useMutation({
      mutationFn: async ({ id, status }: { id: string, status: string }) => {
          const res = await apiRequest("PATCH", `/api/bookings/${id}/status`, { status });
          return await res.json();
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/escort"] });
          toast({ title: "Status Updated" });
      },
      onError: (error: Error) => {
          toast({
              title: "Update Failed",
              description: error.message,
              variant: "destructive"
          });
      }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-white/20" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SosButton />
      <div className="max-w-6xl mx-auto space-y-8 pb-8">
        <div className="flex items-center mb-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white -ml-2 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Discover
            </Button>
          </Link>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Partner Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Welcome back, {escortProfile?.displayName || user?.firstName || user?.email}</p>
            {user?.isVerified ? (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
                <ShieldCheck className="w-3 h-3" /> Verified Partner
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 gap-1">
                <AlertTriangle className="w-3 h-3" /> {escortProfile?.verificationFeePaid ? "Verification Pending" : "Payment Required"}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 bg-secondary/30 px-4 py-2 rounded-full border border-white/5">
           <span className="text-sm font-medium text-white">Availability</span>
           <Switch 
             checked={escortProfile?.availability ?? true} 
             onCheckedChange={(checked) => updateProfileMutation.mutate({ availability: checked })}
             disabled={updateProfileMutation.isPending}
           />
        </div>
      </div>

      {/* Payout Status Alert */}
      {dashboardData?.payouts?.some((p: any) => p.status === 'FAILED') && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
          <div>
            <h3 className="text-red-400 font-semibold">Payout Issue Detected</h3>
            <p className="text-sm text-red-400/80">
              One or more payouts have failed. This is usually due to insufficient platform balance in test mode or missing bank details.
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
         <Card className="bg-card/40 border-white/5 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle>
               <DollarSign className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
               <div className="text-2xl font-bold text-white">₦{Number(dashboardData?.stats?.totalEarnings || 0).toLocaleString()}</div>
               <p className="text-xs text-muted-foreground mt-1">+0% from last month</p>
            </CardContent>
         </Card>
         <Card className="bg-card/40 border-white/5 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payouts</CardTitle>
               <Clock className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
               <div className="text-2xl font-bold text-white">₦{Number(dashboardData?.stats?.pendingPayouts || 0).toLocaleString()}</div>
               <p className="text-xs text-muted-foreground mt-1">
                 {dashboardData?.bookings?.filter((b: any) => {
                   const hasSuccessfulPayout = dashboardData?.payouts?.some((p: any) => p.bookingId === b.id && p.status === 'SUCCESS');
                   return ['PAID', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_CONFIRMED'].includes(b.status) && !hasSuccessfulPayout;
                 }).length} booking(s) in escrow
               </p>
            </CardContent>
         </Card>
         <Card className="bg-card/40 border-white/5 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground">Profile Views</CardTitle>
               <Users className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
               <div className="text-2xl font-bold text-white">{dashboardData?.stats?.profileViews || 0}</div>
            </CardContent>
         </Card>
      </div>

      {/* Active Requests */}
      <div className="space-y-6">
         <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Booking Requests</h2>
            <Badge variant="outline" className="bg-white/5 border-white/10 text-muted-foreground">{dashboardData?.bookings?.length || 0} Total</Badge>
         </div>
         {dashboardData?.bookings?.length === 0 && (
             <div className="text-muted-foreground bg-secondary/20 rounded-xl p-8 text-center border border-white/5">
                No pending requests. Your profile is visible to clients.
             </div>
         )}
         
         {[...(dashboardData?.bookings || [])].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((booking: any) => (
             <Card key={booking.id} className="border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardContent className="p-6">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-1">
                         <div className="flex flex-col items-start gap-1">
                            <Badge variant="outline" className="text-yellow-400 border-yellow-400/20 bg-yellow-400/10 uppercase text-[10px] font-bold tracking-wider">{booking.status.replace(/_/g, ' ')}</Badge>
                            <span className="text-sm text-muted-foreground">Received on {format(new Date(booking.createdAt), "PPP")}</span>
                         </div>
                         <h3 className="text-lg font-bold text-white tracking-tight">Request from {booking.clientName}</h3>
                         <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Scheduled Time</span>
                            <span className="text-white font-medium">Payout: ₦{(Number(booking.amount) * (1 - (booking.commissionRate || dashboardData.platformFeeRate || 0.25))).toLocaleString()}</span>
                         </div>
                      </div>
                      <div className="flex gap-3 w-full md:w-auto">
                         {chatsAllowed?.[booking.clientId] && (
                           <Link href={`/messages/${booking.clientId}`}>
                             <Button variant="outline" size="icon" className="border-white/10 hover:bg-white/5 text-muted-foreground">
                               <MessageSquare className="w-4 h-4" />
                             </Button>
                           </Link>
                         )}
                         {booking.status === 'CREATED' && (
                             <>
                                <Button 
                                    variant="outline" 
                                    className="flex-1 md:flex-none border-white/10 hover:bg-white/5 hover:text-white"
                                    onClick={() => updateStatusMutation.mutate({ id: booking.id, status: 'DECLINED' })}
                                    disabled={updateStatusMutation.isPending}
                                >
                                    Decline
                                </Button>
                                {escortProfile?.verificationFeePaid && currentRecipient ? (
                                  <Button 
                                      className="flex-1 md:flex-none bg-white text-black hover:bg-white/90"
                                      onClick={() => updateStatusMutation.mutate({ id: booking.id, status: 'ACCEPTED' })}
                                      disabled={updateStatusMutation.isPending}
                                  >
                                      {updateStatusMutation.isPending ? <Loader2 className="animate-spin" /> : "Accept Request"}
                                  </Button>
                                ) : (
                                  <Button 
                                      className="flex-1 md:flex-none bg-white/10 text-white/40 cursor-not-allowed"
                                      disabled
                                  >
                                      {!escortProfile?.verificationFeePaid ? "Pay Fee to Accept" : "Set Bank to Accept"}
                                  </Button>
                                )}
                             </>
                         )}
                         {booking.status === 'ACCEPTED' && (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 px-4 py-2">Awaiting Client Payment</Badge>
                         )}
                         {booking.status === 'PAID' && (
                            <div className="flex flex-col gap-2">
                               <Badge className="bg-green-500 text-white border-none text-center justify-center py-1">PAID & READY</Badge>
                               <Button 
                                   className="bg-white text-black hover:bg-white/90 font-bold"
                                   onClick={() => updateStatusMutation.mutate({ id: booking.id, status: 'IN_PROGRESS' })}
                                   disabled={updateStatusMutation.isPending}
                               >
                                   {updateStatusMutation.isPending ? <Loader2 className="animate-spin" /> : "Mark as Started"}
                               </Button>
                            </div>
                         )}
                         {booking.status === 'IN_PROGRESS' && (
                             <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 px-4 py-2">Service in Progress</Badge>
                         )}
                         {booking.status === 'COMPLETED_CONFIRMED' && (
                            <div className="flex flex-row items-center gap-2">
                               <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 px-4 py-2">Awaiting Payout</Badge>
                               {!booking.escortReviewed && (
                                   <Button 
                                     size="sm" 
                                     className="h-8 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-xs"
                                     onClick={() => setBookingToReview(booking)}
                                   >
                                     <Star className="w-3.5 h-3.5 mr-1.5 fill-current" /> Rate Client
                                   </Button>
                               )}
                               {booking.escortReviewed && (
                                   <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px] justify-center">
                                     <Star className="w-3 h-3 mr-1 fill-current" /> Reviewed
                                   </Badge>
                               )}
                            </div>
                         )}
                         {booking.status === 'PAYOUT_INITIATED' && (
                            <div className="flex flex-row items-center gap-2">
                               <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 px-4 py-2">Payout Processing...</Badge>
                               {!booking.escortReviewed && (
                                   <Button 
                                     size="sm" 
                                     className="h-8 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-xs"
                                     onClick={() => setBookingToReview(booking)}
                                   >
                                     <Star className="w-3.5 h-3.5 mr-1.5 fill-current" /> Rate Client
                                   </Button>
                               )}
                               {booking.escortReviewed && (
                                   <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px] justify-center">
                                     <Star className="w-3 h-3 mr-1 fill-current" /> Reviewed
                                   </Badge>
                               )}
                            </div>
                         )}
                         {booking.status === 'PAID_OUT' && (
                            <div className="flex flex-row items-center gap-2">
                               <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 px-4 py-2">Paid Out</Badge>
                               {!booking.escortReviewed && (
                                   <Button 
                                     size="sm" 
                                     className="h-8 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-xs"
                                     onClick={() => setBookingToReview(booking)}
                                   >
                                     <Star className="w-3.5 h-3.5 mr-1.5 fill-current" /> Rate Client
                                   </Button>
                               )}
                               {booking.escortReviewed && (
                                   <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px] justify-center">
                                     <Star className="w-3 h-3 mr-1 fill-current" /> Reviewed
                                   </Badge>
                               )}
                            </div>
                         )}
                      </div>
                   </div>
                </CardContent>
             </Card>
         ))}
      </div>

      {/* Payout History */}
      <div className="mt-12 space-y-6">
         <h2 className="text-xl font-semibold text-white">Recent Payouts</h2>
         <Card className="bg-card/40 border-white/5 overflow-hidden">
            <CardContent className="p-0">
               <div className="overflow-x-auto sleek-scroll">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-white/5 text-muted-foreground font-medium border-b border-white/5">
                        <tr>
                           <th className="px-6 py-4">Reference</th>
                           <th className="px-6 py-4">Date</th>
                           <th className="px-6 py-4">Amount</th>
                           <th className="px-6 py-4">Status</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {payouts?.length === 0 && (
                           <tr>
                              <td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">No payout history found.</td>
                           </tr>
                        )}
                        {payouts?.map((payout: any) => (
                           <tr key={payout.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-4 font-mono text-xs text-white">{payout.transferReference}</td>
                              <td className="px-6 py-4 text-muted-foreground">{format(new Date(payout.createdAt), "PP")}</td>
                              <td className="px-6 py-4 font-bold text-white">₦{Number(payout.amount).toLocaleString()}</td>
                              <td className="px-6 py-4">
                                 <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 uppercase text-[10px]">
                                    {payout.status.replace(/_/g, ' ')}
                                 </Badge>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </CardContent>
         </Card>
      </div>

      <ReviewDialog 
        isOpen={!!bookingToReview}
        onClose={() => setBookingToReview(null)}
        bookingId={bookingToReview?.id}
        revieweeId={bookingToReview?.clientId}
        revieweeName={bookingToReview?.clientName}
      />
    </div>
  </Layout>
  );
}
