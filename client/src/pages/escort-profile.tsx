import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldCheck, MapPin, Star, Calendar as CalendarIcon, User as UserIcon, Lock as LockIcon, Loader2, ChevronLeft, ChevronRight, X as CloseIcon, Search, Award, ArrowLeft } from "lucide-react";
import blurredProfile from "@/assets/generated_images/blurred_portrait_of_a_person_for_privacy.png";
import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { format, differenceInYears } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Escort, Review } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { cn, calculateDistance } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { EngagementModal } from "@/components/engagement-modal";
import { 
  Carousel, 
  CarouselContent, 
  CarouselItem, 
  CarouselNext, 
  CarouselPrevious,
  type CarouselApi
} from "@/components/ui/carousel";

export default function EscortProfile() {
  const [, params] = useRoute("/profile/:id");
  const id = params?.id;
  
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>();
  const [locationName, setLocationName] = useState("");
  const [comment, setComment] = useState("");
  const [amount, setAmount] = useState(25000);
  const [isAgreementChecked, setIsAgreementChecked] = useState(false);
  const [isEngagementModalOpen, setIsEngagementModalOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAuthenticated = !!user;
  
  // const isUploadedImage = (url?: string | null) => url?.startsWith('/uploads/');
  
  const { data: escort, isLoading } = useQuery<Escort & { firstName?: string; lastName?: string }>({
    queryKey: [`/api/escorts/${id}`],
    enabled: !!id
  });

  const { data: reviews, isLoading: isLoadingReviews } = useQuery<Review[]>({
    queryKey: [`/api/reviews/escort/${id}`],
    enabled: !!id
  });

  const allPhotos = useMemo(() => escort?.gallery || [], [escort?.gallery]);

  const [isLandscape, setIsLandscape] = useState(false);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setIsLandscape(naturalWidth > naturalHeight);
  };

  useEffect(() => {
    if (!api) return;
    
    api.on("select", () => {
      setCurrentPhotoIndex(api.selectedScrollSnap());
    });
  }, [api]);

  useEffect(() => {
    if (isLightboxOpen && allPhotos[currentPhotoIndex]) {
      const img = new Image();
      img.src = allPhotos[currentPhotoIndex];
      img.onload = () => {
        setIsLandscape(img.naturalWidth > img.naturalHeight);
      };
    }
  }, [isLightboxOpen, currentPhotoIndex, allPhotos]);

  const openLightbox = (index: number) => {
    if (!isAuthenticated) {
      toast({
        title: "Privacy Protection",
        description: "Please login to view full photos.",
        variant: "default"
      });
      return;
    }
    setCurrentPhotoIndex(index);
    setIsLightboxOpen(true);
    if (api) api.scrollTo(index);
  };

  const createBookingMutation = useMutation({
      mutationFn: async (data: any) => {
          const res = await apiRequest("POST", "/api/bookings", data);
          return await res.json();
      },
      onSuccess: () => {
          toast({
              title: "Booking Created",
              description: "Proceeding to payment...",
          });
          // In a real app, we would redirect to checkout or payment gateway
          // For now, redirect to dashboard to see the booking
          setLocation("/dashboard");
      },
      onError: (error: Error) => {
          toast({
              title: "Booking Failed",
              description: error.message,
              variant: "destructive"
          });
      }
  });

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log("Location access denied or error in profile", error);
        }
      );
    }
  }, []);

  const distance = useMemo(() => {
    if (userCoords && escort?.latitude && escort?.longitude) {
       return calculateDistance(userCoords.lat, userCoords.lng, Number(escort.latitude), Number(escort.longitude)).toFixed(1);
    }
    return "Unknown";
  }, [userCoords, escort]);

  useEffect(() => {
    if (escort?.hourlyRate) {
      setAmount(Number(escort.hourlyRate));
    }
  }, [escort]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-white" /></div>;
  if (!escort) return <div className="text-center py-20 text-white">Escort not found</div>;

  const age = escort.dateOfBirth ? differenceInYears(new Date(), new Date(escort.dateOfBirth)) : 25;

  const baseRate = Number(escort.hourlyRate || 25000);

  const handleRequestBooking = () => {
    if (!user) {
        toast({
            title: "Authentication Required",
            description: "Please login to book an escort.",
            variant: "destructive"
        });
        setLocation("/auth/login");
        return;
    }

    if (user.role !== "CLIENT") {
        toast({
            title: "Action Restricted",
            description: "Only client accounts can book companions. Please use a client account.",
            variant: "destructive"
        });
        return;
    }

    if (user.id === id) {
        toast({
            title: "Action Restricted",
            description: "You cannot book yourself.",
            variant: "destructive"
        });
        return;
    }

    if (!date || !time || !locationName) {
      toast({
        title: "Missing Information",
        description: "Please select a date, time, and meeting location.",
        variant: "destructive"
      });
      return;
    }

    if (!isAgreementChecked) {
      toast({
        title: "Agreement Required",
        description: "Please read and agree to the engagement agreement.",
        variant: "destructive"
      });
      return;
    }
    
    // Save booking details to session storage
    sessionStorage.setItem("booking_details", JSON.stringify({
      escortId: id,
      date: date.toISOString(), // Save as ISO string for reliable parsing
      displayDate: format(date, "PPP"), // Keep for UI display
      time,
      location: locationName,
      comment,
      amount
    }));

    // Redirect to checkout
    setLocation("/checkout");
  };

  const timeSlots = [
    "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", 
    "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM",
    "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM",
    "08:00 PM", "09:00 PM", "10:00 PM", "11:00 PM"
  ];

  return (
    <Layout hideFooter>
      <div className="max-w-7xl mx-auto px-4 pt-1 pb-2 md:py-8 lg:pb-8">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white mb-1 md:mb-6 -ml-2 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Discovery
          </Button>
        </Link>
      </div>
      <div className="flex flex-col lg:grid lg:grid-cols-[1.2fr_0.8fr] gap-4 md:gap-8 max-w-6xl mx-auto pb-24 lg:pb-0">
        <div className="space-y-6 md:space-y-8">
          <div className="relative aspect-[3/4] md:aspect-video w-full overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-secondary/20">
            {escort.avatar ? (
              <img 
                src={escort.avatar} 
                alt="Profile" 
                className={`w-full h-full object-cover md:object-top transition-all duration-700 ${!isAuthenticated ? 'blur-[12px] opacity-80' : 'blur-0 opacity-100'}`} 
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center bg-secondary/50`}>
                <UserIcon className="w-20 h-20 text-muted-foreground/30" />
              </div>
            )}
            {!isAuthenticated && escort.avatar && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/40 backdrop-blur-sm">
                <LockIcon className="w-8 h-8 text-white/60 mb-3" />
                <p className="text-sm font-semibold text-white">Login to view clear photos</p>
                <p className="text-xs text-white/60 mt-1">Privacy protection active</p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-6">
              <div className="flex items-center gap-2 mb-1 md:mb-2">
                 <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight">
                   {escort.firstName ? `${escort.firstName} ${escort.lastName || ''}` : escort.displayName}
                 </h1>
                 <div className="flex flex-wrap gap-1 items-center">
                   {escort.trustLevel !== "BRONZE" && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 backdrop-blur-md gap-1 px-2 py-0.5 text-[10px] md:text-xs">
                      <ShieldCheck className="w-3 h-3 md:w-3.5 md:h-3.5" /> Verified
                      </Badge>
                   )}
                   {escort.badges && Array.isArray(escort.badges) && (escort.badges as string[]).map((badge) => (
                      <Badge key={badge} variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 backdrop-blur-md gap-1 px-2 py-0.5 text-[10px] md:text-xs">
                        <Award className="w-3 h-3 md:w-3.5 md:h-3.5" /> {badge}
                      </Badge>
                   ))}
                   {(escort as any).isBusy && (
                      <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 backdrop-blur-md gap-1 px-2 py-0.5 text-[10px] md:text-xs font-bold animate-pulse">
                        Busy
                      </Badge>
                   )}
                 </div>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs md:text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" /> {distance} km away
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs md:text-sm text-muted-foreground flex items-center gap-2">
                    <UserIcon className="w-3.5 h-3.5" /> {age} yrs
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-1 md:px-0">
            <div className="space-y-3">
              <h2 className="text-lg md:text-xl font-semibold text-white">About</h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {escort.bio || "No bio available."}
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-lg md:text-xl font-semibold text-white">Services</h2>
              <div className="flex flex-wrap gap-2">
                {(escort.services && Array.isArray(escort.services) && escort.services.length > 0) ? (
                  (escort.services as string[]).map((service) => (
                    <Badge key={service} variant="outline" className="bg-white/5 border-white/10 text-muted-foreground hover:text-white transition-colors cursor-default">
                      {service}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">No specific services listed</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-lg md:text-xl font-semibold text-white">Gallery</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
                 {(escort.gallery && escort.gallery.length > 0) ? (
                   escort.gallery.map((img, idx) => (
                     <div 
                        key={idx} 
                        className="aspect-square rounded-xl md:rounded-2xl overflow-hidden border border-white/5 bg-white/5 hover:border-white/10 transition-colors cursor-pointer group"
                        onClick={() => openLightbox(idx)}
                      >
                        <img 
                          src={img} 
                          alt={`Gallery ${idx + 1}`} 
                          className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-110 ${!isAuthenticated ? 'blur-[8px] opacity-70' : 'blur-0 opacity-100'}`} 
                        />
                     </div>
                   ))
                 ) : (
                   <div className="col-span-full py-8 text-center text-muted-foreground/50 border border-dashed border-white/10 rounded-2xl">
                     No gallery images uploaded
                   </div>
                 )}
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg md:text-xl font-semibold text-white">Reviews</h2>
                <div className="flex items-center gap-1.5 text-yellow-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-bold">{escort.averageRating ? Number(escort.averageRating).toFixed(1) : "0.0"}</span>
                  <span className="text-sm text-muted-foreground">({escort.reviewCount || 0} reviews)</span>
                </div>
              </div>

              <div className="space-y-4">
                {isLoadingReviews ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/20" /></div>
                ) : reviews && reviews.length > 0 ? (
                  reviews.map((review) => (
                    <div key={review.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-white">{(review as any).reviewerName || "Anonymous"}</span>
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={`w-3 h-3 ${i < review.rating ? 'text-yellow-500 fill-current' : 'text-white/10'}`} 
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(review.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground italic">"{review.comment}"</p>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground/50 border border-dashed border-white/10 rounded-2xl">
                    No reviews yet. Be the first to book and review!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-24 h-fit fixed bottom-0 left-0 right-0 lg:relative z-40 lg:z-0 bg-background/80 backdrop-blur-xl lg:bg-transparent border-t lg:border-t-0 border-white/5">
          <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl lg:shadow-black/40 hidden lg:block overflow-hidden">
             <CardContent className="p-6 space-y-6">
              <div className="flex justify-between items-baseline border-b border-white/5 pb-4">
                <div className="flex flex-col">
                   <span className="text-3xl font-bold text-white">₦{amount.toLocaleString()}</span>
                   <span className="text-sm text-muted-foreground">per hour</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-yellow-500/80">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-medium">{escort.averageRating ? Number(escort.averageRating).toFixed(1) : "0.0"}</span>
                  <span className="text-muted-foreground ml-1">({escort.reviewCount || 0})</span>
                </div>
              </div>
              
              <div className="space-y-4 py-4 text-left">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label className="text-white">Date</Label>
                    <div className="relative">
                      <Input
                        type="date"
                        value={date ? format(date, "yyyy-MM-dd") : ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value) {
                            setDate(new Date(value));
                          } else {
                            setDate(undefined);
                          }
                        }}
                        min={format(new Date(), "yyyy-MM-dd")}
                        className="w-full bg-white/5 border-white/10 text-white h-11 px-3 focus:ring-1 focus:ring-primary [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-white">Start Time</Label>
                      <Select value={time} onValueChange={setTime}>
                        <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-60 overflow-y-auto">
                          {timeSlots.map(slot => (
                            <SelectItem key={slot} value={slot} className="hover:bg-white/10 focus:bg-white/10">{slot}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Duration</Label>
                      <Select defaultValue="1" onValueChange={(val) => setAmount(baseRate * parseInt(val))}>
                        <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
                          <SelectValue placeholder="Hours" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-60 overflow-y-auto">
                          {[1, 2, 3, 4, 6, 8, 12, 24].map(h => (
                            <SelectItem key={h} value={h.toString()} className="hover:bg-white/10 focus:bg-white/10">{h} {h === 1 ? 'Hour' : 'Hours'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Meeting Location</Label>
                    <Input 
                      placeholder="e.g. Radisson Blu, Victoria Island" 
                      className="h-11 border-white/10 bg-white/5 text-white"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Special Instructions (Optional)</Label>
                    <Textarea 
                      placeholder="Any specific requests or directions..." 
                      className="border-white/10 bg-white/5 text-white min-h-[80px]"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>

                  <div className="flex items-start space-x-3 pt-2">
                    <Checkbox 
                      id="agreement-desktop" 
                      checked={isAgreementChecked}
                      onCheckedChange={(checked) => setIsAgreementChecked(checked as boolean)}
                      className="mt-1 border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="agreement-desktop"
                        className="text-xs font-medium leading-none text-gray-300 cursor-pointer"
                      >
                        I agree to {escort.displayName}'s{" "}
                        <button 
                          type="button"
                          onClick={() => setIsEngagementModalOpen(true)}
                          className="text-primary hover:underline font-bold"
                        >
                          Engagement Agreement
                        </button>
                      </label>
                      <p className="text-[10px] text-muted-foreground">
                        Terms are binding upon booking confirmation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleRequestBooking} 
                className={`w-full h-12 text-base font-semibold ${
                  ((user && user.role !== 'CLIENT') || (escort as any).isBusy || !isAgreementChecked) 
                    ? 'bg-white/10 text-white/40 cursor-not-allowed' 
                    : 'bg-white text-black hover:bg-white/90 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]'
                }`}
                disabled={createBookingMutation.isPending || (user && user.role !== 'CLIENT') || (escort as any).isBusy || !isAgreementChecked}
              >
                {createBookingMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (user && user.role !== 'CLIENT') ? (
                  "Booking Restricted"
                ) : (escort as any).isBusy ? (
                  "Busy (In a Session)"
                ) : (
                  "Confirm & Pay"
                )}
              </Button>
             </CardContent>
          </Card>
          
          {/* Mobile Booking Bar */}
          <div className="lg:hidden p-4 flex items-center justify-between gap-4">
             <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">₦{amount.toLocaleString()}</span>
                  <div className="flex items-center gap-0.5 text-xs text-yellow-500/80">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{escort.averageRating ? Number(escort.averageRating).toFixed(1) : "0.0"}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">per hour</span>
             </div>
             <Dialog>
                <DialogTrigger asChild>
                   <Button 
                     onClick={(e) => {
                       if (!user) {
                         e.preventDefault();
                         e.stopPropagation();
                         toast({
                           title: "Authentication Required",
                           description: "Please login to book an escort.",
                           variant: "destructive"
                         });
                         setLocation("/auth/login");
                       }
                     }}
                     className={`flex-1 font-bold h-12 rounded-xl ${
                       ((user && user.role !== 'CLIENT') || (escort as any).isBusy) 
                         ? 'bg-white/10 text-white/40 cursor-not-allowed' 
                         : 'bg-white text-black hover:bg-white/90 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]'
                     }`}
                     disabled={(user && user.role !== 'CLIENT') || (escort as any).isBusy}
                   >
                      {(user && user.role !== 'CLIENT') 
                        ? "Restricted" 
                        : (escort as any).isBusy 
                          ? "Busy" 
                          : "Book Now"}
                   </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] bg-[#121212] border-white/10 text-white h-[90vh] sm:h-fit max-h-[90vh] flex flex-col p-0 overflow-hidden">
                   <div className="p-6 pb-2 shrink-0">
                      <DialogHeader>
                         <DialogTitle>Book {escort.displayName}</DialogTitle>
                         <DialogDescription>
                            Complete your booking details below.
                         </DialogDescription>
                      </DialogHeader>
                   </div>
                   <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                      <div className="space-y-2">
                         <Label className="text-white">Date</Label>
                         <div className="relative">
                            <Input
                               type="date"
                               value={date ? format(date, "yyyy-MM-dd") : ""}
                               onChange={(e) => {
                                  const value = e.target.value;
                                  if (value) {
                                     setDate(new Date(value));
                                  } else {
                                     setDate(undefined);
                                  }
                               }}
                               min={format(new Date(), "yyyy-MM-dd")}
                               className="w-full bg-white/5 border-white/10 text-white h-11 px-3 focus:ring-1 focus:ring-primary [color-scheme:dark]"
                            />
                         </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-2">
                            <Label className="text-white">Start Time</Label>
                            <Select value={time} onValueChange={setTime}>
                               <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
                                  <SelectValue placeholder="Select" />
                               </SelectTrigger>
                               <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-60 overflow-y-auto">
                                  {timeSlots.map(slot => (
                                     <SelectItem key={slot} value={slot} className="hover:bg-white/10 focus:bg-white/10">{slot}</SelectItem>
                                  ))}
                               </SelectContent>
                            </Select>
                         </div>
                         <div className="space-y-2">
                            <Label className="text-white">Duration</Label>
                            <Select defaultValue="1" onValueChange={(val) => setAmount(baseRate * parseInt(val))}>
                               <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
                                  <SelectValue placeholder="Hours" />
                               </SelectTrigger>
                               <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-60 overflow-y-auto">
                                  {[1, 2, 3, 4, 6, 8, 12, 24].map(h => (
                                     <SelectItem key={h} value={h.toString()} className="hover:bg-white/10 focus:bg-white/10">{h} {h === 1 ? 'Hour' : 'Hours'}</SelectItem>
                                  ))}
                               </SelectContent>
                            </Select>
                         </div>
                      </div>
                      <div className="space-y-2">
                         <Label className="text-white">Meeting Location</Label>
                         <Input 
                            placeholder="e.g. Radisson Blu, Victoria Island" 
                            className="h-11 border-white/10 bg-white/5 text-white"
                            value={locationName}
                            onChange={(e) => setLocationName(e.target.value)}
                         />
                      </div>
                      <div className="space-y-2">
                         <Label className="text-white">Special Instructions (Optional)</Label>
                         <Textarea 
                            placeholder="Any specific requests..." 
                            className="border-white/10 bg-white/5 text-white min-h-[80px]"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                         />
                      </div>

                      <div className="flex items-start space-x-3 pt-2">
                        <Checkbox 
                          id="agreement" 
                          checked={isAgreementChecked}
                          onCheckedChange={(checked) => setIsAgreementChecked(checked as boolean)}
                          className="mt-1 border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor="agreement"
                            className="text-xs font-medium leading-none text-gray-300 cursor-pointer"
                          >
                            I have read and agree to {escort.displayName}'s{" "}
                            <button 
                              type="button"
                              onClick={() => setIsEngagementModalOpen(true)}
                              className="text-primary hover:underline font-bold"
                            >
                              Engagement Agreement
                            </button>
                          </label>
                          <p className="text-[10px] text-muted-foreground">
                            This agreement is binding once booking is confirmed.
                          </p>
                        </div>
                      </div>
                   </div>
                   <div className="p-6 pt-2 shrink-0 border-t border-white/5 bg-white/[0.02]">
                      <Button 
                         onClick={handleRequestBooking} 
                         className={`w-full h-12 text-base font-semibold ${
                           !isAgreementChecked 
                             ? 'bg-white/10 text-white/40 cursor-not-allowed' 
                             : 'bg-white text-black hover:bg-white/90 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]'
                         }`}
                         disabled={createBookingMutation.isPending || !isAgreementChecked}
                      >
                         {createBookingMutation.isPending ? <Loader2 className="animate-spin" /> : `Confirm & Pay ₦${amount.toLocaleString()}`}
                      </Button>
                   </div>
                </DialogContent>
             </Dialog>

             <EngagementModal 
               isOpen={isEngagementModalOpen}
               onClose={() => setIsEngagementModalOpen(false)}
               escortName={escort.displayName}
               agreementText={escort.engagementAgreement || ""}
             />
          </div>
        </div>
      </div>
      {/* Lightbox */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent 
          className={cn(
            "p-0 border-0 bg-black/95 flex flex-col items-center justify-center z-[100] transition-all duration-300 ease-in-out overflow-hidden outline-none",
            "max-w-full md:max-w-[95vw] w-full md:w-fit h-full md:h-fit max-h-screen md:max-h-[95vh] rounded-none md:rounded-2xl"
          )}
        >
          <DialogTitle className="sr-only">Photo Gallery</DialogTitle>
          <DialogDescription className="sr-only">Viewing photos of {escort.displayName}</DialogDescription>
          
          <div className="absolute top-4 right-4 z-[110] flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white bg-black/20 backdrop-blur-md hover:bg-white/10 rounded-full h-10 w-10 md:h-12 md:w-12 border border-white/10"
              onClick={() => setIsLightboxOpen(false)}
            >
              <CloseIcon className="h-6 w-6 md:h-8 md:w-8" />
            </Button>
          </div>

          {allPhotos.length > 0 && isLightboxOpen && (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-0 md:p-4">
              <Carousel setApi={setApi} className="w-full h-full">
                <CarouselContent className="h-full">
                  {allPhotos.map((photo, index) => (
                    <CarouselItem key={index} className="flex items-center justify-center h-full">
                      <div className="relative flex items-center justify-center w-full h-full max-h-[90vh] md:max-h-[90vh]">
                        <img
                          src={photo}
                          alt={`Photo ${index + 1}`}
                          className="max-w-full max-h-full w-auto h-auto object-contain shadow-2xl transition-all duration-500 rounded-none md:rounded-lg"
                          onLoad={handleImageLoad}
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                
                <div className="hidden md:flex">
                  <CarouselPrevious className="left-4 bg-black/40 border-white/10 text-white hover:bg-black/60 h-12 w-12 backdrop-blur-sm" />
                  <CarouselNext className="right-4 bg-black/40 border-white/10 text-white hover:bg-black/60 h-12 w-12 backdrop-blur-sm" />
                </div>
              </Carousel>
              
              {/* Counter/Navigation for Mobile & Desktop */}
              <div className="absolute bottom-6 md:static mt-0 md:mt-4 flex justify-center items-center gap-6 text-white/80 text-sm font-semibold tracking-wider w-full px-4">
                <button 
                  onClick={() => api?.scrollPrev()}
                  className="p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 transition-colors md:hidden"
                  disabled={currentPhotoIndex === 0}
                >
                  <ChevronLeft className={cn("w-6 h-6", currentPhotoIndex === 0 && "opacity-20")} />
                </button>
                <span className="hidden md:block bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 shadow-lg">
                  {currentPhotoIndex + 1} / {allPhotos.length}
                </span>
                <button 
                  onClick={() => api?.scrollNext()}
                  className="p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 transition-colors md:hidden"
                  disabled={currentPhotoIndex === allPhotos.length - 1}
                >
                  <ChevronRight className={cn("w-6 h-6", currentPhotoIndex === allPhotos.length - 1 && "opacity-20")} />
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
