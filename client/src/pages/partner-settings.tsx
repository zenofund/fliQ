import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  User, 
  Building2, 
  ShieldCheck, 
  Camera, 
  Lock as LockIcon, 
  Bell,
  Wallet,
  AlertTriangle,
  Upload,
  CreditCard,
  Calendar as CalendarIcon,
  X,
  Plus,
  Clock,
  Info,
  Loader2,
  Trash2,
  MapPin,
  ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import blurredProfile from "@/assets/generated_images/blurred_portrait_of_a_person_for_privacy.png";
import { useState, useEffect, useRef } from "react";
import { format, differenceInYears } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ImageCropper } from "@/components/image-cropper";
import imageCompression from 'browser-image-compression';
import { TrustedContacts } from "@/components/trusted-contacts";

export default function PartnerSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const idDocInputRef = useRef<HTMLInputElement>(null);
  const selfieDocInputRef = useRef<HTMLInputElement>(null);
  
  // Profile States
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [dob, setDob] = useState<Date | undefined>();
  const [gallery, setGallery] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string>("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [engagementAgreement, setEngagementAgreement] = useState("");
  const [coords, setCoords] = useState<{ lat: string, lng: string } | null>(null);
  const [verificationDocs, setVerificationDocs] = useState<any>({});
  const [verificationState, setVerificationState] = useState<'initial' | 'pending' | 'approved' | 'rejected'>('initial');

  // Cropper States
  const [cropperOpen, setCropperOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'gallery' | 'idDoc' | 'selfieDoc'>('avatar');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Security States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Bank States
  const [accountNumber, setAccountNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState("");
  const [resolvedName, setResolvedName] = useState("");

  const STANDARD_AGREEMENT_TEMPLATE = `1. Respect and boundaries must be maintained at all times.
2. No smoking or illegal substances during the engagement.
3. No filming or photography without explicit prior consent.
4. Payment must be confirmed via the fliQ escrow system before the meeting starts.
5. Cancellations must be made at least 2 hours in advance.
6. The escort reserves the right to terminate the engagement if safety is compromised.`;

  const { data: escortProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["/api/escort/profile"],
  });

  useEffect(() => {
    if (escortProfile) {
      setDisplayName(escortProfile.displayName || "");
      setBio(escortProfile.bio || "");
      setHourlyRate(escortProfile.hourlyRate?.toString() || "25000");
      setDob(escortProfile.dateOfBirth ? new Date(escortProfile.dateOfBirth) : undefined);
      setGallery(escortProfile.gallery || []);
      setAvatar(escortProfile.avatar || "");
      if (escortProfile.services && Array.isArray(escortProfile.services)) {
        setSelectedServices(escortProfile.services);
      }
      setEngagementAgreement(escortProfile.engagementAgreement || "");
      if (escortProfile.latitude && escortProfile.longitude) {
        setCoords({ lat: escortProfile.latitude.toString(), lng: escortProfile.longitude.toString() });
      }
      setVerificationDocs(escortProfile.verificationDocs || {});
      
      if (escortProfile.isVerified) {
        setVerificationState('approved');
      } else {
        const status = escortProfile.verificationDocs?.status?.toLowerCase();
        if (status === 'pending') {
          setVerificationState('pending');
        } else if (status === 'rejected') {
          setVerificationState('rejected');
        } else if (escortProfile.verificationDocs?.idImage) {
          setVerificationState('pending');
        } else {
          setVerificationState('initial');
        }
      }
    }
  }, [escortProfile]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/user", data);
      return await res.json();
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ["/api/user"] });
      const previousUser = queryClient.getQueryData(["/api/user"]);
      if (previousUser) {
        queryClient.setQueryData(["/api/user"], {
          ...previousUser,
          ...newData,
        });
      }
      return { previousUser };
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      toast({
        title: "Settings Updated",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (error: Error, _newData, context) => {
      if (context?.previousUser) {
        queryClient.setQueryData(["/api/user"], context.previousUser);
      }
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const handleNotificationChange = (id: string, checked: boolean) => {
    const currentSettings = (user?.notificationSettings as any) || {
      bookingUpdates: true,
      newsMessages: true,
      paymentAlerts: true,
      pushNotifications: true
    };
    const newSettings = { ...currentSettings, [id]: checked };
    updateUserMutation.mutate({ notificationSettings: newSettings });
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/escort/profile", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/profile"] });
      toast({
        title: "Changes Saved",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/user/password", data);
    },
    onSuccess: () => {
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const { data: adminSettings } = useQuery({
     queryKey: ["/api/admin/settings"],
   });

   const { data: banks, isLoading: isLoadingBanks } = useQuery({
     queryKey: ["/api/banks"],
     queryFn: async () => {
       const res = await fetch("/api/banks", { credentials: "include" });
       if (!res.ok) throw new Error("Failed to fetch banks");
       return res.json();
     }
   });

   const { data: currentRecipient } = useQuery({
     queryKey: ["/api/escort/recipient"],
   });

  const payVerificationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/escort/pay-verification");
      return await res.json();
    },
    onSuccess: (data) => {
      window.location.href = data.authorization_url;
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Initialization Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: async (reference: string) => {
      const res = await apiRequest("POST", "/api/escort/verify-verification", { reference });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/profile"] });
      toast({
        title: "Verification Successful",
        description: "Your account is now ready for payout setup.",
      });
    }
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    if (reference) {
      verifyPaymentMutation.mutate(reference);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }, []);

  const resolveAccountMutation = useMutation({
    mutationFn: async (data: { accountNumber: string, bankCode: string }) => {
      const res = await apiRequest("POST", "/api/banks/resolve", data);
      return await res.json();
    },
    onSuccess: (res) => {
      if (res.status) {
        setResolvedName(res.data.account_name);
      }
    },
    onError: (error: Error) => {
      setResolvedName("");
      
      let displayMessage = "Could not find account. Please check the account number and bank.";
      
      try {
        // Attempt to extract the JSON error message from the "400: {json}" format
        const jsonPart = error.message.substring(error.message.indexOf("{"));
        const parsed = JSON.parse(jsonPart);
        if (parsed.message) {
          displayMessage = parsed.message;
        }
      } catch (e) {
        // If parsing fails, use the raw message if it doesn't contain the status code
        if (!error.message.includes("400") && !error.message.includes("500")) {
           displayMessage = error.message;
        }
      }

      toast({
        title: "Account Resolution Failed",
        description: displayMessage,
        variant: "destructive"
      });
    },
  });

  const saveBankMutation = useMutation({
    mutationFn: async (data: { accountNumber: string, bankName: string, bankCode: string }) => {
      const res = await apiRequest("POST", "/api/escort/recipient", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escort/recipient"] });
      toast({
        title: "Bank Details Updated",
        description: "Your payout settings have been updated. A 24-hour cooldown is now active.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank) {
      const bank = banks?.find((b: any) => b.code === selectedBank);
      if (bank) {
        setResolvedName(""); // Clear previous name
        resolveAccountMutation.mutate({ accountNumber, bankCode: selectedBank });
      }
    } else {
      setResolvedName("");
    }
  }, [accountNumber, selectedBank, banks]);

  useEffect(() => {
    updateLocation();
  }, []);

  const availableServices = [
    "Dinner Date", "Social Events", "Travel Companion", 
    "Business Functions", "City Guide", "Conversationalist",
    "Event Hostess", "Private Dinners", "Art & Gallery"
  ];

  const toggleService = (service: string) => {
    if (selectedServices.includes(service)) {
      if (selectedServices.length > 2) {
        setSelectedServices(selectedServices.filter(s => s !== service));
      } else {
        toast({
          title: "Minimum Services",
          description: "You must select at least 2 services.",
          variant: "destructive"
        });
      }
    } else {
      if (selectedServices.length < 3) {
        setSelectedServices([...selectedServices, service]);
      } else {
        toast({
          title: "Maximum Services",
          description: "You can only select up to 3 services.",
          variant: "destructive"
        });
      }
    }
  };

  const updateLocation = () => {
    if (!("geolocation" in navigator)) {
      if (!sessionStorage.getItem('locationNoticeShown')) {
        toast({
          title: "Geolocation not supported",
          description: "Your browser doesn't support location services.",
          variant: "destructive"
        });
        sessionStorage.setItem('locationNoticeShown', 'true');
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude.toString(), lng: longitude.toString() });
        toast({
          title: "Location Captured",
          description: "Don't forget to save your profile to update your public location.",
        });
      },
      () => {
        toast({
          title: "Location Access Denied",
          description: "Please enable location to update your professional proximity.",
          variant: "destructive"
        });
      }
    );
  };

  const handleSave = (section: string) => {
    let payload = {};
    if (section === "profile") {
      payload = {
        displayName,
        bio,
        hourlyRate: hourlyRate.replace(/,/g, ""),
        dateOfBirth: dob?.toISOString(),
        avatar,
        services: selectedServices,
        engagementAgreement,
        latitude: coords?.lat,
        longitude: coords?.lng,
      };
    } else if (section === "gallery") {
      payload = { gallery };
    } else if (section === "verification") {
      if (!verificationDocs.idType || !verificationDocs.idImage || !verificationDocs.selfieImage || !verificationDocs.idNumber) {
        toast({
          title: "Missing Information",
          description: "Please select ID type, upload all required documents and enter ID number.",
          variant: "destructive"
        });
        return;
      }
      payload = { 
        verificationDocs: { 
          ...verificationDocs, 
          status: 'PENDING',
          submittedAt: new Date().toISOString()
        } 
      };
    } else if (section === "security") {
      if (newPassword !== confirmPassword) {
        toast({
          title: "Error",
          description: "New passwords do not match.",
          variant: "destructive"
        });
        return;
      }
      updatePasswordMutation.mutate({ currentPassword, newPassword });
      return;
    }
    
    updateProfileMutation.mutate(payload);
  };

  const handleFileUpload = async (file: File, type: 'avatar' | 'gallery' | 'idDoc' | 'selfieDoc') => {
    // For avatar, we show the cropper first
    if (type === 'avatar') {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
        setCropType('avatar');
        setCropperOpen(true);
      };
      reader.readAsDataURL(file);
      return;
    }

    let fileToUpload = file;

    // For gallery images, we compress them
    if (type === 'gallery') {
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };
        fileToUpload = await imageCompression(file, options);
      } catch (error) {
        console.error("Compression error:", error);
      }
    }

    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      const fileUrl = data.url;

      if (type === 'gallery') {
        setGallery([...gallery, fileUrl]);
      } else if (type === 'idDoc') {
        setVerificationDocs({ ...verificationDocs, idImage: fileUrl });
      } else if (type === 'selfieDoc') {
        setVerificationDocs({ ...verificationDocs, selfieImage: fileUrl });
      }

      toast({
        title: "Upload Successful",
        description: type === 'gallery' ? "Image compressed and uploaded." : "File has been uploaded.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const onCropComplete = async (croppedBlob: Blob) => {
    setCropperOpen(false);
    
    // If it's an avatar update, set loading state
    if (cropType === 'avatar') {
      setIsUploadingAvatar(true);
    }
    
    const file = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setAvatar(data.url);

      toast({
        title: "Avatar Updated",
        description: "Your cropped avatar has been uploaded.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      if (cropType === 'avatar') {
        setIsUploadingAvatar(false);
      }
    }
  };

  const addImageToGallery = () => {
    if (gallery.length >= 6) {
      toast({
        title: "Gallery Full",
        description: "You can only upload up to 6 gallery photos.",
        variant: "destructive"
      });
      return;
    }
    galleryInputRef.current?.click();
  };

  const removeImage = (index: number) => {
    setGallery(gallery.filter((_, i) => i !== index));
  };

  const changeAvatar = () => {
    avatarInputRef.current?.click();
  };

  if (isLoadingProfile || isLoadingBanks) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-8">
        <div className="flex items-center mb-6">
          <Link href="/escort-dashboard">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white -ml-2 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Partner Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your professional profile and payouts.</p>
          </div>
          {!escortProfile?.verificationFeePaid && (
            <Badge variant="destructive" className="w-fit h-fit px-3 py-1 animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-2" /> Action Required: Verification Fee
            </Badge>
          )}
        </div>

        {/* Restriction Overlay for Unverified Partners */}
        {!escortProfile?.verificationFeePaid && (
           <div className="mb-8 p-6 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-md">
              <div className="flex flex-col md:flex-row items-center gap-6">
                 <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-8 h-8 text-red-400" />
                 </div>
                 <div className="flex-1 space-y-2 text-center md:text-left">
                    <h3 className="text-xl font-bold text-white">Activate Your Account</h3>
                    <p className="text-sm text-red-200/60 leading-relaxed">
                       Partners must pay a mandatory, non-refundable verification fee of <strong>₦{Number(adminSettings?.verificationFee || 1500).toLocaleString()}</strong> before they can accept bookings or access payout functionality.
                    </p>
                 </div>
                 <Button 
                   onClick={() => payVerificationMutation.mutate()}
                   disabled={payVerificationMutation.isPending}
                   className="w-full md:w-auto bg-red-500 hover:bg-red-600 text-white font-bold h-12 px-8"
                 >
                    {payVerificationMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                    {payVerificationMutation.isPending ? "Processing..." : "Pay Verification Fee"}
                 </Button>
              </div>
           </div>
        )}

        <div className={!escortProfile?.verificationFeePaid ? "opacity-50 pointer-events-none grayscale select-none" : ""}>
          {/* Hidden File Inputs */}
          <input 
            type="file" 
            ref={avatarInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatar')} 
          />
          <input 
            type="file" 
            ref={galleryInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'gallery')} 
          />
          <input 
            type="file" 
            ref={idDocInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'idDoc')} 
          />
          <input 
            type="file" 
            ref={selfieDocInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'selfieDoc')} 
          />

          <Tabs defaultValue="profile" className="space-y-6">
            <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="bg-secondary/30 border border-white/5 p-1 w-max sm:w-full justify-start sm:justify-center">
                <TabsTrigger value="profile" className="gap-2 flex-shrink-0">
                  <User className="w-4 h-4" /> Profile
                </TabsTrigger>
                <TabsTrigger value="gallery" className="gap-2 flex-shrink-0">
                  <Camera className="w-4 h-4" /> Gallery
                </TabsTrigger>
                <TabsTrigger value="bank" className="gap-2 flex-shrink-0">
                  <Building2 className="w-4 h-4" /> Bank Details
                </TabsTrigger>
                <TabsTrigger value="verification" className="gap-2 flex-shrink-0">
                  <ShieldCheck className="w-4 h-4" /> Verification
                </TabsTrigger>
                <TabsTrigger value="notifications" className="gap-2 flex-shrink-0">
                  <Bell className="w-4 h-4" /> Notifications
                </TabsTrigger>
                <TabsTrigger value="safety" className="gap-2 flex-shrink-0">
                  <ShieldCheck className="w-4 h-4" /> Safety
                </TabsTrigger>
                <TabsTrigger value="security" className="gap-2 flex-shrink-0">
                  <LockIcon className="w-4 h-4" /> Security
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="profile" className="space-y-6">
              <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Public Profile</CardTitle>
                  <CardDescription>This information is visible to potential clients.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                     <div className="relative group cursor-pointer" onClick={changeAvatar}>
                        <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-dashed border-white/10 group-hover:border-white/20 transition-colors relative">
                           {isUploadingAvatar ? (
                             <div className="w-full h-full bg-muted/20 animate-pulse flex items-center justify-center">
                               <Loader2 className="w-8 h-8 text-primary animate-spin" />
                             </div>
                           ) : (
                             <>
                               <img src={avatar || blurredProfile} className={`w-full h-full object-cover ${!avatar ? "blur-[2px]" : ""}`} />
                               <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Camera className="w-8 h-8 text-white" />
                               </div>
                             </>
                           )}
                        </div>
                        <Badge className="absolute -bottom-2 -right-2 bg-white text-black">Edit</Badge>
                     </div>
                     <div className="flex-1 w-full space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Phone Number</Label>
                            <Input 
                              value={user?.phone || ""} 
                              disabled
                              className="bg-white/5 border-white/10 opacity-70 cursor-not-allowed" 
                            />
                            <p className="text-[10px] text-muted-foreground mt-1 italic">
                              Phone numbers are verified at signup and cannot be changed here.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label>Display Name</Label>
                            <Input 
                              value={displayName} 
                              onChange={(e) => setDisplayName(e.target.value)}
                              className="bg-white/5 border-white/10" 
                            />
                          </div>
                          <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <div className="relative">
                    <Input
                      type="date"
                      value={dob ? format(dob, "yyyy-MM-dd") : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value) {
                          setDob(new Date(value));
                        } else {
                          setDob(undefined);
                        }
                      }}
                      min="1970-01-01"
                      max="2007-12-31"
                      className="w-full bg-white/5 border-white/10 text-white h-10 px-3 focus:ring-1 focus:ring-primary [color-scheme:dark]"
                    />
                  </div>
                  {dob && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Calculated Age: {differenceInYears(new Date(), dob)} years
                    </p>
                  )}
                </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Hourly Rate (₦)</Label>
                          <Input 
                            value={Number(hourlyRate).toLocaleString()} 
                            onChange={(e) => setHourlyRate(e.target.value.replace(/\D/g, ""))}
                            className="bg-white/5 border-white/10" 
                          />
                        </div>

                        <div className="pt-4 border-t border-white/5">
                           <Label className="text-white flex items-center gap-2 mb-3">
                              <MapPin className="w-4 h-4 text-blue-400" />
                              Professional Proximity
                           </Label>
                           <div className="flex flex-col md:flex-row items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
                              <div className="flex-1 text-center md:text-left">
                                 <p className="text-sm text-white font-medium">
                                    {coords ? `Coordinates: ${Number(coords.lat).toFixed(4)}, ${Number(coords.lng).toFixed(4)}` : "Detecting location..."}
                                 </p>
                                 <p className="text-xs text-muted-foreground mt-1">
                                    Your exact location is never shown. Clients only see distance in km.
                                 </p>
                              </div>
                           </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Short Bio</Label>
                          <Textarea 
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            className="bg-white/5 border-white/10 min-h-[100px]" 
                          />
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4 text-primary" />
                              Custom Engagement Agreement
                            </Label>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[10px] bg-white/5 border-white/10 hover:bg-white/10"
                              onClick={() => setEngagementAgreement(STANDARD_AGREEMENT_TEMPLATE)}
                            >
                              Use Template
                            </Button>
                          </div>
                          <Textarea 
                            value={engagementAgreement}
                            onChange={(e) => setEngagementAgreement(e.target.value)}
                            placeholder="Enter your house rules or engagement terms here..."
                            className="bg-white/5 border-white/10 min-h-[120px] text-sm" 
                          />
                          <p className="text-[10px] text-muted-foreground italic">
                            This agreement will be shown to clients as a mandatory pop-up before they can confirm a booking with you.
                          </p>
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <Label>Services (Select 2-3)</Label>
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                              {selectedServices.length}/3 selected
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {availableServices.map((service) => {
                              const isSelected = selectedServices.includes(service);
                              return (
                                <button
                                  key={service}
                                  onClick={() => toggleService(service)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                                    isSelected 
                                      ? "bg-white text-black border-white shadow-[0_0_15px_-5px_rgba(255,255,255,0.4)]" 
                                      : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20 hover:bg-white/10"
                                  }`}
                                >
                                  {service}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                     </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button 
                      onClick={() => handleSave("profile")} 
                      disabled={updateProfileMutation.isPending}
                      className="bg-white text-black hover:bg-white/90 px-8"
                    >
                      {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Save Profile
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="gallery" className="space-y-6">
              <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Photo Gallery</CardTitle>
                  <CardDescription>Upload up to 6 high-quality photos. Authenticated users will see clear versions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {gallery.map((img, index) => (
                      <div key={index} className="relative aspect-square rounded-xl overflow-hidden group border border-white/10">
                        <img src={img} className="w-full h-full object-cover" />
                        <button 
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {gallery.length < 6 && (
                      <div 
                        onClick={addImageToGallery}
                        className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 hover:border-white/20 hover:bg-white/5 transition-all text-muted-foreground hover:text-white cursor-pointer group"
                      >
                        <div className="p-2 bg-white/5 rounded-full group-hover:bg-white/10 transition-colors">
                           <Plus className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-medium">Add Photo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button 
                      onClick={() => handleSave("gallery")} 
                      disabled={updateProfileMutation.isPending}
                      className="bg-white text-black hover:bg-white/90 px-8"
                    >
                      {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Save Gallery
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bank" className="space-y-6">
              <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5" /> Payout Settings
                  </CardTitle>
                  <CardDescription>Configure where you receive your earnings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {currentRecipient && (
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-blue-400">
                          <ShieldCheck className="w-4 h-4" />
                          <span className="text-sm font-semibold">Active Payout Account</span>
                        </div>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                          {currentRecipient.bankName}
                        </Badge>
                      </div>
                      <div className="text-xs text-blue-200/60 leading-relaxed">
                        Last updated: {format(new Date(currentRecipient.lastChangedAt), "PPP p")}
                      </div>
                      
                      {Date.now() - new Date(currentRecipient.lastChangedAt).getTime() < 24 * 60 * 60 * 1000 && (
                        <div className="flex items-center gap-2 mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400">
                          <Clock className="w-4 h-4 animate-pulse" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">24-Hour Payout Cooldown Active</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`space-y-6 ${!escortProfile?.verificationFeePaid ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
                      <div className="flex gap-3">
                        <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <strong>Security Note:</strong> All details are resolved via our secure banking verification system. We do not store raw account numbers for your protection.
                        </p>
                      </div>
                      <div className="flex gap-3 pt-2 border-t border-white/5">
                        <AlertTriangle className="w-5 h-5 text-yellow-500/50 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed italic">
                          <strong>Verification Tip:</strong> Our verification system has daily limits for account lookups. If you experience issues with resolving your account, please contact support.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Select Bank</Label>
                        <Select value={selectedBank} onValueChange={setSelectedBank} disabled={isLoadingBanks}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue placeholder={isLoadingBanks ? "Loading banks..." : "Choose Bank"} />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-white/10 text-white max-h-80 overflow-y-auto">
                            {banks?.map((bank: any) => (
                              <SelectItem key={`${bank.id}-${bank.code}`} value={bank.code}>{bank.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Account Number</Label>
                        <Input 
                          placeholder="0123456789" 
                          className="bg-white/5 border-white/10 text-white" 
                          maxLength={10}
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                        />
                      </div>
                    </div>

                    {(resolveAccountMutation.isPending || resolvedName) && (
                      <div className="p-4 rounded-xl bg-secondary/30 border border-white/5">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Resolved Account Name</div>
                        {resolveAccountMutation.isPending ? (
                          <div className="flex items-center gap-2 text-white">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Resolving account...</span>
                          </div>
                        ) : (
                          <div className="text-lg font-bold text-white tracking-tight">{resolvedName}</div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-4">
                      <Button 
                        onClick={() => {
                          const bank = banks?.find((b: any) => b.code === selectedBank);
                          saveBankMutation.mutate({ 
                            accountNumber, 
                            bankName: bank?.name || "", 
                            bankCode: selectedBank 
                          });
                        }} 
                        disabled={!resolvedName || saveBankMutation.isPending}
                        className="bg-white text-black hover:bg-white/90 px-8"
                      >
                        {saveBankMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                        Update Payout Account
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="verification" className="space-y-6">
               <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
                  {verificationState === 'initial' && (
                    <>
                      <CardHeader>
                         <CardTitle>Document Verification</CardTitle>
                         <CardDescription>Upload government-issued identification for account activation.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                               <Label className="flex items-center gap-1">
                                 Government ID Type <span className="text-red-500">*</span>
                               </Label>
                               <Select 
                                 value={verificationDocs?.idType || ""}
                                 onValueChange={(val) => setVerificationDocs({ ...verificationDocs, idType: val })}
                               >
                                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                     <SelectValue placeholder="Select ID Type" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-card border-white/10 text-white max-h-80 overflow-y-auto">
                                     <SelectItem value="passport">International Passport</SelectItem>
                                     <SelectItem value="nin">NIN Slip / Card</SelectItem>
                                     <SelectItem value="license">Driver's License</SelectItem>
                                     <SelectItem value="voters">Voter's Card</SelectItem>
                                  </SelectContent>
                               </Select>

                               <Label className="flex items-center gap-1">
                                 ID Number <span className="text-red-500">*</span>
                               </Label>
                               <Input 
                                 placeholder="Enter ID Number" 
                                 value={verificationDocs?.idNumber || ""}
                                 onChange={(e) => setVerificationDocs({ ...verificationDocs, idNumber: e.target.value })}
                                 className="bg-white/5 border-white/10 text-white" 
                               />
                               
                               <div 
                                 onClick={() => idDocInputRef.current?.click()}
                                 className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-white/20 transition-colors cursor-pointer group overflow-hidden relative"
                               >
                                  {verificationDocs.idImage ? (
                                    <img src={verificationDocs.idImage} className="absolute inset-0 w-full h-full object-cover opacity-40" />
                                  ) : (
                                    <div className="p-3 bg-white/5 rounded-full group-hover:bg-white/10 transition-colors relative z-10">
                                       <Upload className="w-6 h-6 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="space-y-1 relative z-10">
                                     <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
                                       {verificationDocs.idImage ? "ID Photo Uploaded" : "Click to upload ID photo"}
                                       {!verificationDocs.idImage && <span className="text-red-500">*</span>}
                                     </p>
                                     <p className="text-xs text-muted-foreground">Front view, max 5MB (JPG, PNG)</p>
                                  </div>
                               </div>
                            </div>

                            <div className="space-y-4">
                               <Label className="flex items-center gap-1">
                                 Live Verification Photo <span className="text-red-500">*</span>
                               </Label>
                               <div 
                                 onClick={() => selfieDocInputRef.current?.click()}
                                 className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-white/20 transition-colors cursor-pointer group h-[calc(100%-2rem)] overflow-hidden relative"
                               >
                                  {verificationDocs.selfieImage ? (
                                    <img src={verificationDocs.selfieImage} className="absolute inset-0 w-full h-full object-cover opacity-40" />
                                  ) : (
                                    <div className="p-3 bg-white/5 rounded-full group-hover:bg-white/10 transition-colors relative z-10">
                                       <Camera className="w-6 h-6 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="space-y-1 relative z-10">
                                     <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
                                       {verificationDocs.selfieImage ? "Selfie Uploaded" : "Take a selfie with your ID"}
                                       {!verificationDocs.selfieImage && <span className="text-red-500">*</span>}
                                     </p>
                                     <p className="text-xs text-muted-foreground">Clear view of face and ID document</p>
                                  </div>
                               </div>
                            </div>
                         </div>
                         <div className="flex justify-end pt-4">
                            <Button 
                              onClick={() => handleSave("verification")} 
                              disabled={updateProfileMutation.isPending}
                              className="bg-white text-black hover:bg-white/90 px-8"
                            >
                              {updateProfileMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                              Submit Documents
                            </Button>
                         </div>
                      </CardContent>
                    </>
                  )}

                  {verificationState === 'pending' && (
                    <div className="p-12 flex flex-col items-center text-center space-y-6">
                      <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center relative">
                        <Clock className="w-10 h-10 text-blue-400 animate-pulse" />
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center border-2 border-background">
                          <Info className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-white">Verification Awaiting Approval</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                          Your documents have been submitted successfully. Our admin team is currently reviewing your application. This process may take up to <span className="text-white font-semibold">4 working days</span>.
                        </p>
                      </div>
                    </div>
                  )}

                  {verificationState === 'approved' && (
                    <div className="relative overflow-hidden rounded-3xl">
                      <div className="absolute inset-0 bg-[#121417]/80 backdrop-blur-xl" />
                      <div className="relative p-12 md:p-16 flex flex-col items-center text-center space-y-8">
                        {/* Glowy Icon */}
                        <div className="relative">
                          <div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full" />
                          <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20 relative z-10">
                            <ShieldCheck className="w-12 h-12 text-green-500" />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <Badge className="bg-[#00E676] hover:bg-[#00E676]/90 text-black font-bold border-none px-4 py-1 rounded-full text-xs">
                            Verified Partner
                          </Badge>
                          <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                            Verification Approved
                          </h3>
                          <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                            Your identity has been confirmed. Your profile now carries the verified badge, increasing client trust and visibility.
                          </p>
                        </div>

                        <div className="pt-4 flex flex-wrap justify-center gap-4 w-full">
                          <div className="w-40 p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center gap-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Status</p>
                            <p className="text-lg font-bold text-[#00E676]">Active</p>
                          </div>
                          <div className="w-40 p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center gap-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Tier</p>
                            <p className="text-lg font-bold text-white">
                              {escortProfile?.trustLevel ? `${escortProfile.trustLevel.charAt(0) + escortProfile.trustLevel.slice(1).toLowerCase()} Partner` : 'Partner'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {verificationState === 'rejected' && (
                    <div className="p-12 flex flex-col items-center text-center space-y-6">
                      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                        <X className="w-10 h-10 text-red-400" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-white">Verification Disapproved</h3>
                        <p className="text-red-200/60 max-w-sm mx-auto">
                          Unfortunately, your documents were not clear enough for our security team to verify. Please ensure all text is legible.
                        </p>
                      </div>
                      <Button onClick={() => setVerificationState('initial')} className="bg-white text-black hover:bg-white/90 px-8 mt-4">
                        Retry Verification
                      </Button>
                    </div>
                  )}
               </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
            <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Control how you receive updates and alerts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  {[
                    { id: "bookingUpdates", label: "Booking Updates", desc: "Get notified when a booking is made, accepted or started." },
                    { id: "newsMessages", label: "News Messages", desc: "Receive alerts for news and platform updates." },
                    { id: "paymentAlerts", label: "Payment Alerts", desc: "Get notified about payments and escrow releases." },
                    { id: "pushNotifications", label: "Push Notification", desc: "Send all sensitive and time bound alerts via push and in-app notification system." }
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <div className="space-y-0.5">
                        <Label htmlFor={item.id} className="text-white cursor-pointer font-medium">{item.label}</Label>
                        <p className="text-xs text-muted-foreground pr-8">{item.desc}</p>
                      </div>
                      <Switch 
                        id={item.id}
                        checked={((user?.notificationSettings as any)?.[item.id]) ?? true}
                        onCheckedChange={(checked) => handleNotificationChange(item.id, checked)}
                        className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-white/10 border-white/5 shadow-[0_0_10px_rgba(34,197,94,0.2)]"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="safety" className="space-y-6">
              <TrustedContacts />
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Security Settings</CardTitle>
                  <CardDescription>Manage your account security and password.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <Label>Current Password</Label>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="bg-white/5 border-white/10 text-white" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>New Password</Label>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-white/5 border-white/10 text-white" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm New Password</Label>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-white/5 border-white/10 text-white" 
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button 
                      onClick={() => handleSave("security")} 
                      disabled={updatePasswordMutation.isPending}
                      className="bg-white text-black hover:bg-white/90 px-8"
                    >
                      {updatePasswordMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                      Update Password
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {cropperOpen && imageToCrop && (
        <ImageCropper 
          image={imageToCrop} 
          onCropComplete={onCropComplete} 
          onCancel={() => setCropperOpen(false)}
          aspect={cropType === 'avatar' ? 1 : undefined}
        />
      )}
    </Layout>
  );
}
