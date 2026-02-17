import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Lock as LockIcon, CreditCard, MapPin, Calendar, Clock, Loader2, ArrowLeft } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import blurredProfile from "@/assets/generated_images/blurred_portrait_of_a_person_for_privacy.png";
import { PaymentModal } from "@/components/payment-modal";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Escort } from "@shared/schema";

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [bookingDetails, setBookingDetails] = useState<any>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("booking_details");
    if (saved) {
      setBookingDetails(JSON.parse(saved));
    } else {
      // If no booking details, redirect back to home
      toast({
        title: "Session Expired",
        description: "Please restart your booking request.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [setLocation, toast]);

  const { data: escort, isLoading: escortLoading } = useQuery<Escort>({
    queryKey: [`/api/escorts/${bookingDetails?.escortId}`],
    enabled: !!bookingDetails?.escortId
  });

  const { data: adminSettings } = useQuery<any>({
    queryKey: ["/api/admin/settings"],
  });

  const createBookingMutation = useMutation({
    mutationFn: async (data: any) => {
      // Create the booking request (status will be 'CREATED' by default)
      const res = await apiRequest("POST", "/api/bookings", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Booking Request Sent",
        description: "Your request has been sent to the companion. You'll be notified once they accept.",
      });
      setLocation("/client-dashboard");
    },
    onError: (error: Error) => {
      const isVerificationError = error.message.toLowerCase().includes("verify") || error.message.toLowerCase().includes("verification");
      toast({
        title: "Booking Failed",
        description: error.message,
        variant: "destructive",
        action: isVerificationError ? (
          <ToastAction altText="Verify Now" onClick={() => setLocation("/profile?tab=verification")}>
            Verify Now
          </ToastAction>
        ) : undefined,
      });
    },
  });

  // Calculate real values based on live escort data
  const baseRate = escort ? Number(escort.hourlyRate) : 0;
  
  // Calculate duration from the amount saved in sessionStorage and the base rate
  // This ensures we maintain the intended duration even if the rate changed slightly
  const duration = bookingDetails?.amount && baseRate ? Math.max(1, Math.round(bookingDetails.amount / baseRate)) : 1;
  
  // Real escort amount based on current live rate
  const escortAmount = baseRate * duration;
  
  // 5% Escrow fee as requested
  const escrowFee = Math.round(escortAmount * 0.05);
  const totalAmount = escortAmount + escrowFee;

  const handleProceed = () => {
    if (!escort || !bookingDetails) return;
    
    try {
      console.log("Raw booking details:", { date: bookingDetails.date, time: bookingDetails.time });
      
      // Parse the date
      let baseDate: Date;
      
      // If it looks like an ISO string or a standard date string
      if (bookingDetails.date.includes('T') || !isNaN(Date.parse(bookingDetails.date))) {
        baseDate = new Date(bookingDetails.date);
      } else {
        // Fallback for the old format "January 30th, 2026"
        // Remove "th", "st", "nd", "rd" from day
        const cleanedDate = bookingDetails.date.replace(/(\d+)(st|nd|rd|th)/, "$1");
        baseDate = new Date(cleanedDate);
      }

      if (isNaN(baseDate.getTime())) {
        console.error("Failed to parse base date:", bookingDetails.date);
        throw new RangeError("Invalid base date");
      }
      
      // Parse the time string (e.g., "02:00 PM")
      const timeStr = bookingDetails.time || "12:00 PM";
      const parts = timeStr.split(' ');
      if (parts.length !== 2) {
        throw new RangeError("Invalid time format: " + timeStr);
      }
      
      const [timePart, modifier] = parts;
      let [hours, minutes] = timePart.split(':').map(Number);
      
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      
      const startTime = new Date(baseDate);
      startTime.setHours(hours, minutes, 0, 0);
      
      if (isNaN(startTime.getTime())) {
        console.error("Invalid startTime constructed:", { baseDate, hours, minutes });
        throw new RangeError("Invalid start time");
      }

      const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);
      
      if (isNaN(endTime.getTime())) {
        throw new RangeError("Invalid end time");
      }

      createBookingMutation.mutate({
        escortId: bookingDetails.escortId,
        amount: totalAmount.toString(),
        location: bookingDetails.location,
        notes: bookingDetails.comment,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
    } catch (error) {
      console.error("Date parsing error:", error);
      toast({
        title: "Invalid Date/Time",
        description: "There was an error processing your booking schedule. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!bookingDetails || escortLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto pt-8 md:pt-16 pb-8">
        <div className="mb-4 px-4">
          <Link href={`/profile/${bookingDetails?.escortId}`}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white -ml-2 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Profile
            </Button>
          </Link>
        </div>
        <div className="mb-8 text-center px-4">
          <h1 className="text-3xl font-bold text-white tracking-tight">Secure Checkout</h1>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
            <LockIcon className="w-4 h-4" /> 256-bit SSL Encrypted
          </p>
        </div>

        <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl mx-4">
          <CardHeader className="border-b border-white/5 pb-6">
            <div className="flex items-center gap-4">
               <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/10">
                  <img src={escort?.avatar || blurredProfile} className={`w-full h-full object-cover ${!escort?.avatar ? "blur-[2px]" : ""}`} />
               </div>
               <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg text-white truncate">{escort?.displayName || "Companion"}</CardTitle>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                      <Calendar className="w-3 h-3" /> {bookingDetails?.displayDate || bookingDetails?.date}
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                      <Clock className="w-3 h-3" /> {bookingDetails?.time}
                    </div>
                  </div>
               </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Meeting Details Summary */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-blue-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Meeting Location</p>
                  <p className="text-sm text-white font-medium">{bookingDetails?.location}</p>
                </div>
              </div>
              {bookingDetails?.comment && (
                <div className="pt-2 border-t border-white/5">
                   <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Your Instructions</p>
                   <p className="text-xs text-white italic">"{bookingDetails?.comment}"</p>
                </div>
              )}
            </div>

            {/* Price Breakdown */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Booking Rate</span>
                <span className="text-white">₦{escortAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Secure Escrow Fee</span>
                <span className="text-white">₦{escrowFee.toLocaleString()}</span>
              </div>
              <div className="h-px bg-white/5 my-2" />
              <div className="flex justify-between text-lg font-bold text-white">
                <span>Total Amount</span>
                <span>₦{totalAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* Escrow Notice */}
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-blue-200">Escrow Protection Active</h4>
                <p className="text-[11px] text-blue-300/70 leading-relaxed">
                  Your funds are held securely. The companion is notified once payment is confirmed. Payout only happens after meeting.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-2 pb-6">
            <Button 
              className="w-full h-12 text-base bg-white text-black hover:bg-white/90 font-bold rounded-xl shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] border-none" 
              onClick={handleProceed}
              disabled={createBookingMutation.isPending}
            >
              {createBookingMutation.isPending ? "Sending Request..." : "Send Booking Request"}
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground mt-6 px-8 leading-relaxed uppercase tracking-widest font-bold opacity-50">
          No payment is required now. You only pay after the companion accepts your request.
        </p>
      </div>
    </Layout>
  );
}
