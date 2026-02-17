import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Bell, Lock as LockIcon, Wallet, CreditCard, ShieldCheck, Loader2, ArrowLeft, Camera, Upload, AlertTriangle, CheckCircle2, Clock, Info, X } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import blurredProfile from "@/assets/generated_images/blurred_portrait_of_a_person_for_privacy.png";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImageCropper } from "@/components/image-cropper";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TrustedContacts } from "@/components/trusted-contacts";

export default function ClientSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const [avatar, setAvatar] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const [verificationState, setVerificationState] = useState<'initial' | 'pending' | 'approved' | 'rejected'>('initial');
  const [verificationDocs, setVerificationDocs] = useState<any>({});
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const idDocInputRef = useRef<HTMLInputElement>(null);
  const selfieDocInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || ""
      }));
      setAvatar(user.avatar || null);
      
      if (user.isVerified) {
        setVerificationState('approved');
      } else {
        const status = (user.verificationDocs as any)?.status?.toLowerCase();
        if (status === 'pending') {
          setVerificationState('pending');
        } else if (status === 'rejected') {
          setVerificationState('rejected');
        } else if ((user.verificationDocs as any)?.idImage) {
          setVerificationState('pending');
        } else {
          setVerificationState('initial');
        }
      }
      setVerificationDocs(user.verificationDocs || {});
    }
  }, [user]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/user", data);
      return await res.json();
    },
    onMutate: async (newData) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["/api/user"] });

      // Snapshot the previous value
      const previousUser = queryClient.getQueryData(["/api/user"]);

      // Optimistically update to the new value
      if (previousUser) {
        queryClient.setQueryData(["/api/user"], {
          ...previousUser,
          ...newData,
        });
      }

      return { previousUser };
    },
    onSuccess: (updatedUser) => {
      // Update with the actual data from the server
      queryClient.setQueryData(["/api/user"], updatedUser);
      toast({
        title: "Profile Updated",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (error: Error, _newData, context) => {
      // Rollback to the previous value if mutation fails
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
      // Always refetch after error or success to ensure we're in sync
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSaveGeneral = () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast({
        title: "Validation Error",
        description: "First name and last name are required.",
        variant: "destructive"
      });
      return;
    }

    updateUserMutation.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone
    });
  };

  const handleSaveSecurity = () => {
    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "New password and confirmation do not match.",
        variant: "destructive"
      });
      return;
    }
    
    // In a real app, we would verify current password first
    updateUserMutation.mutate({
      passwordHash: formData.newPassword // Simplified for this demo
    });
  };

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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setCropperOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropperOpen(false);
    setIsUploadingAvatar(true);
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
      
      // Update user profile with new avatar
      updateUserMutation.mutate({ avatar: data.url });

      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const changeAvatar = () => {
    avatarInputRef.current?.click();
  };

  const handleFileUpload = async (file: File, type: 'idDoc' | 'selfie') => {
    setIsUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error("Upload failed");
      
      const { url } = await res.json();
      
      if (type === 'idDoc') {
        setVerificationDocs(prev => ({ ...prev, idImage: url }));
      } else {
        setVerificationDocs(prev => ({ ...prev, selfieImage: url }));
      }
      
      toast({
        title: "Upload Successful",
        description: "Your document has been uploaded."
      });
    } catch (err: any) {
      toast({
        title: "Upload Failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleSaveVerification = () => {
    if (!verificationDocs.idType || !verificationDocs.idNumber || !verificationDocs.idImage || !verificationDocs.selfieImage) {
      toast({
        title: "Missing Information",
        description: "Please complete all verification fields and uploads.",
        variant: "destructive"
      });
      return;
    }

    updateUserMutation.mutate({
      verificationDocs: {
        ...verificationDocs,
        status: 'PENDING',
        submittedAt: new Date().toISOString()
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-8">
        <input 
          type="file" 
          ref={avatarInputRef} 
          className="hidden" 
          accept="image/*"
          onChange={handleAvatarChange} 
        />
        
        {cropperOpen && selectedImage && (
          <ImageCropper 
            image={selectedImage} 
            onCropComplete={handleCropComplete} 
            onCancel={() => setCropperOpen(false)} 
          />
        )}

        <div className="flex items-center mb-6">
          <Link href={user?.role === 'ADMIN' ? "/admin" : "/client-dashboard"}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white -ml-2 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Account Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your personal information and preferences.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="bg-secondary/30 border border-white/5 p-1 w-max sm:w-full justify-start sm:justify-center">
              <TabsTrigger value="general" className="gap-2 flex-shrink-0">
                <User className="w-4 h-4" /> General
              </TabsTrigger>
              {user?.role !== 'ADMIN' && (
                <TabsTrigger value="billing" className="gap-2 flex-shrink-0">
                  <CreditCard className="w-4 h-4" /> Billing
                </TabsTrigger>
              )}
              <TabsTrigger value="notifications" className="gap-2 flex-shrink-0">
                <Bell className="w-4 h-4" /> Notifications
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 flex-shrink-0">
                <LockIcon className="w-4 h-4" /> Security
              </TabsTrigger>
              <TabsTrigger value="safety" className="gap-2 flex-shrink-0">
                <ShieldCheck className="w-4 h-4" /> Safety
              </TabsTrigger>
              {user?.role !== 'ADMIN' && (
                <TabsTrigger value="verification" className="gap-2 flex-shrink-0">
                  <ShieldCheck className="w-4 h-4" /> Verification
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="general" className="space-y-6">
            <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your basic account details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6 items-center md:items-start pb-4 border-b border-white/5">
                   <div className="relative group cursor-pointer" onClick={changeAvatar}>
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-dashed border-white/10 group-hover:border-white/20 transition-colors">
                         <img src={avatar || blurredProfile} className={`w-full h-full object-cover ${!avatar ? "blur-[2px]" : ""}`} />
                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-6 h-6 text-white" />
                         </div>
                      </div>
                      <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-lg">
                         {isUploadingAvatar && (
                           <div className="absolute -inset-1 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                         )}
                         <Upload className="w-3 h-3 text-white" />
                      </div>
                   </div>
                   <div className="flex-1 text-center md:text-left space-y-1">
                      <h4 className="text-sm font-medium text-white">Profile Photo</h4>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Upload a clear photo. This helps companions identify you during meetups.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 h-8 border-white/10 hover:bg-white/5 text-xs"
                        onClick={changeAvatar}
                      >
                        Change Avatar
                      </Button>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input 
                        id="firstName" 
                        value={formData.firstName} 
                        onChange={handleInputChange}
                        className="bg-white/5 border-white/10 text-white" 
                        placeholder="First Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input 
                        id="lastName" 
                        value={formData.lastName} 
                        onChange={handleInputChange}
                        className="bg-white/5 border-white/10 text-white" 
                        placeholder="Last Name"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input 
                            id="email" 
                            value={formData.email} 
                            onChange={handleInputChange}
                            className="bg-white/5 border-white/10 text-white" 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input 
                            id="phone" 
                            value={formData.phone} 
                            onChange={handleInputChange}
                            className="bg-white/5 border-white/10 text-white" 
                            placeholder="+234 800 000 0000"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1 italic">
                          Format: +234 followed by 10 digits (e.g., +234 800 000 0000)
                        </p>
                    </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSaveGeneral} 
                    disabled={updateUserMutation.isPending} 
                    className="bg-white text-black hover:bg-white/90 px-8"
                  >
                    {updateUserMutation.isPending ? <Loader2 className="animate-spin" /> : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="safety" className="space-y-6">
            <TrustedContacts />
          </TabsContent>

          {user?.role !== 'ADMIN' && (
            <TabsContent value="billing" className="space-y-6">
              <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>Manage your saved cards and billing history.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 rounded-xl border border-white/5 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-8 bg-blue-600 rounded flex items-center justify-center text-[10px] font-bold text-white">VISA</div>
                      <div>
                        <p className="text-sm font-medium text-white">Visa ending in 4242</p>
                        <p className="text-xs text-muted-foreground">Expires 12/2026</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">Remove</Button>
                  </div>
                  <Button variant="outline" className="w-full border-white/10 hover:bg-white/5 text-white">
                    Add New Payment Method
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

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

          <TabsContent value="security" className="space-y-6">
            <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your password and account protection.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input 
                    id="currentPassword" 
                    type="password" 
                    placeholder="••••••••" 
                    className="bg-white/5 border-white/10 text-white" 
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input 
                        id="newPassword" 
                        type="password" 
                        placeholder="••••••••" 
                        className="bg-white/5 border-white/10 text-white" 
                        value={formData.newPassword}
                        onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input 
                        id="confirmPassword" 
                        type="password" 
                        placeholder="••••••••" 
                        className="bg-white/5 border-white/10 text-white" 
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSaveSecurity} 
                    className="bg-white text-black hover:bg-white/90 px-8"
                    disabled={updateUserMutation.isPending}
                  >
                    {updateUserMutation.isPending ? <Loader2 className="animate-spin" /> : "Update Password"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {user?.role !== 'ADMIN' && (
            <TabsContent value="verification" className="space-y-6">
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
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'selfie')} 
              />

              <Card className="border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
                {verificationState === 'initial' && (
                  <>
                    <CardHeader>
                      <CardTitle>Identity Verification</CardTitle>
                      <CardDescription>Upload government-issued identification to verify your account.</CardDescription>
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
                            <SelectContent className="bg-card border-white/10 text-white">
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
                              <p className="text-xs text-muted-foreground">JPG, PNG up to 5MB</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <Label className="flex items-center gap-1">
                            Selfie Verification <span className="text-red-500">*</span>
                          </Label>
                          <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-2">
                             <div className="flex items-center gap-2 text-blue-400">
                                <Info className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Instructions</span>
                             </div>
                             <p className="text-[10px] text-blue-200/60 leading-relaxed">
                                Please take a clear selfie holding your ID card next to your face. Ensure your face and ID details are clearly visible.
                             </p>
                          </div>
                          <div 
                            onClick={() => selfieDocInputRef.current?.click()}
                            className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-white/20 transition-colors cursor-pointer group overflow-hidden relative"
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
                                {verificationDocs.selfieImage ? "Selfie Uploaded" : "Click to upload selfie"}
                                {!verificationDocs.selfieImage && <span className="text-red-500">*</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">Must show your face + ID</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/5 flex justify-end">
                        <Button 
                          onClick={handleSaveVerification} 
                          disabled={updateUserMutation.isPending || isUploadingDoc}
                          className="bg-white text-black hover:bg-white/90 px-8"
                        >
                          {updateUserMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                          Submit for Verification
                        </Button>
                      </div>
                    </CardContent>
                  </>
                )}

                {verificationState === 'pending' && (
                  <div className="p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
                      <Clock className="w-8 h-8 text-blue-400 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Verification Pending</h3>
                      <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                        Your documents are being reviewed by our security team. This usually takes 12-24 hours.
                      </p>
                    </div>
                  </div>
                )}

                {verificationState === 'approved' && (
                  <div className="p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Account Verified</h3>
                      <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                        Your identity has been confirmed. You now have full access to all platform features.
                      </p>
                    </div>
                  </div>
                )}

                {verificationState === 'rejected' && (
                   <div className="p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Verification Rejected</h3>
                      <p className="text-red-200/60 mt-2 max-w-sm mx-auto mb-6">
                        Reason: {(user?.verificationDocs as any)?.rejectionReason || "Documents were unclear or invalid."}
                      </p>
                      <Button 
                        variant="outline" 
                        className="border-white/10 hover:bg-white/5"
                        onClick={() => setVerificationState('initial')}
                      >
                        Try Again
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
