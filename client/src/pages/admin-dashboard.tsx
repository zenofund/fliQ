import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Settings, 
  ShieldAlert, 
  BarChart3, 
  AlertCircle, 
  Percent, 
  Clock, 
  Ban,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  FileText,
  MapPin,
  ArrowLeft,
  Megaphone
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["/api/admin/stats"],
  });

  const { data: settings, isLoading: settingsLoading, error: settingsError } = useQuery({
    queryKey: ["/api/admin/settings"],
  });

  const { data: disputes, isLoading: disputesLoading, error: disputesError } = useQuery({
    queryKey: ["/api/admin/disputes"],
  });

  const { data: verifications, isLoading: verificationsLoading, error: verificationsError } = useQuery({
    queryKey: ["/api/admin/verifications"],
  });

  const { data: logs, isLoading: logsLoading, error: logsError } = useQuery({
    queryKey: ["/api/admin/logs"],
  });

  const { data: payouts, isLoading: payoutsLoading } = useQuery({
    queryKey: ["/api/admin/payouts"],
  });

  const [vfee, setVfee] = useState("");
  const [platformFeeRate, setPlatformFeeRate] = useState("");
  const [autoReleaseTimeout, setAutoReleaseTimeout] = useState("");
  const [disputeWindow, setDisputeWindow] = useState("");
  const [proximityRadius, setProximityRadius] = useState("");
  const [requirePartnerApproval, setRequirePartnerApproval] = useState(false);
  const [payoutsPaused, setPayoutsPaused] = useState(false);
  const [selectedVerification, setSelectedVerification] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastTarget, setBroadcastTarget] = useState<string>("ALL");

  const broadcastMutation = useMutation({
    mutationFn: async (data: { title: string, body: string, targetRole?: string }) => {
      const res = await apiRequest("POST", "/api/admin/broadcast", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Broadcast Sent",
        description: `Successfully sent to ${data.successCount} of ${data.total} users.`,
      });
      setBroadcastTitle("");
      setBroadcastBody("");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Broadcast Failed",
        description: error.message,
      });
    }
  });

  useEffect(() => {
    if (settings) {
      setVfee(settings.verificationFee || "");
      setPlatformFeeRate((Number(settings.platformFeeRate || 0) * 100).toString());
      setAutoReleaseTimeout(settings.autoReleaseTimeout?.toString() || "12");
      setDisputeWindow(settings.disputeWindow?.toString() || "60");
      setProximityRadius(settings.proximityRadius?.toString() || "50");
      setRequirePartnerApproval(settings.requirePartnerApproval || false);
      setPayoutsPaused(settings.payoutsPaused || false);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: any) => {
      const res = await apiRequest("PATCH", "/api/admin/settings", newSettings);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Settings Updated",
        description: "Platform configuration has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message,
      });
    }
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: async ({ id, resolution }: { id: string, resolution: string }) => {
      await apiRequest("POST", `/api/admin/disputes/${id}/resolve`, { resolution });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Dispute Resolved",
        description: "The dispute has been processed successfully.",
      });
    },
  });

  const approveVerificationMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/verifications/${userId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
      toast({
        title: "User Verified",
        description: "The user has been successfully verified.",
      });
    },
  });

  const retryPayoutMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      await apiRequest("POST", `/api/admin/payouts/${payoutId}/retry`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Payout Retried",
        description: "The payout has been queued for retry.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Retry Failed",
        description: error.message,
      });
    }
  });

  const rejectVerificationMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string, reason: string }) => {
      await apiRequest("POST", `/api/admin/verifications/${userId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
      toast({
        title: "Verification Rejected",
        description: "The user's verification has been rejected.",
      });
    },
  });

  const handleSaveConfig = () => {
    const release = parseInt(autoReleaseTimeout);
    const window = parseInt(disputeWindow);
    const radius = parseInt(proximityRadius);

    if (isNaN(release) || isNaN(window) || isNaN(radius)) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Configuration values must be valid numbers.",
      });
      return;
    }

    updateSettingsMutation.mutate({
      verificationFee: vfee,
      platformFeeRate: (Number(platformFeeRate) / 100).toString(),
      autoReleaseTimeout: release,
      disputeWindow: window,
      proximityRadius: radius,
      requirePartnerApproval: requirePartnerApproval,
      payoutsPaused: payoutsPaused,
    });
  };

  if (statsLoading || settingsLoading || disputesLoading || logsLoading || verificationsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-white/20" />
        </div>
      </Layout>
    );
  }

  if (statsError || settingsError || disputesError || logsError || verificationsError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Error Loading Admin Data</h2>
          <p className="text-white/60 mb-6 text-center max-w-md">
            {((statsError || settingsError || disputesError || logsError || verificationsError) as Error)?.message || "An unknown error occurred while fetching admin data."}
          </p>
          <Button onClick={() => window.location.reload()} variant="outline" className="border-white/10 hover:bg-white/5">
            Retry
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center mb-2">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white -ml-2 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Discover
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Admin Control Center</h1>
        <p className="text-muted-foreground mt-1">Platform-wide configuration and monitoring.</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="bg-secondary/30 border border-white/5 p-1 w-max sm:w-full justify-start sm:justify-center">
            <TabsTrigger value="overview" className="gap-2 flex-shrink-0">
              <BarChart3 className="w-4 h-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="verifications" className="gap-2 flex-shrink-0">
              <CheckCircle2 className="w-4 h-4" /> Verifications
              {verifications?.length > 0 && (
                <Badge className="ml-1 bg-blue-500/20 text-blue-400 border-blue-500/30">{verifications.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 flex-shrink-0">
              <Settings className="w-4 h-4" /> Configuration
            </TabsTrigger>
            <TabsTrigger value="disputes" className="gap-2 flex-shrink-0">
              <ShieldAlert className="w-4 h-4" /> Disputes
              {disputes?.length > 0 && (
                <Badge className="ml-1 bg-red-500/20 text-red-400 border-red-500/30">{disputes.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2 flex-shrink-0">
              <Clock className="w-4 h-4" /> Payouts
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2 flex-shrink-0">
              <FileText className="w-4 h-4" /> Logs
            </TabsTrigger>
            <TabsTrigger value="broadcast" className="gap-2 flex-shrink-0">
              <Megaphone className="w-4 h-4" /> Broadcast
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-card/40 border-white/5">
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground font-medium">Escrow Balance</div>
                <div className="text-2xl font-bold text-white mt-1">₦{Number(stats?.escrowBalance || 0).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="bg-card/40 border-white/5">
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground font-medium">Pending Payouts</div>
                <div className="text-2xl font-bold text-white mt-1">₦{Number(stats?.pendingPayouts || 0).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="bg-card/40 border-white/5">
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground font-medium">Total Commission</div>
                <div className="text-2xl font-bold text-green-400 mt-1">₦{Number(stats?.totalCommission || 0).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="bg-card/40 border-white/5">
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground font-medium">Active Disputes</div>
                <div className="text-2xl font-bold text-red-400 mt-1">{stats?.activeDisputes || 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/5 bg-card/20">
            <CardHeader>
              <CardTitle className="text-lg">Recent System Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {logs && logs.length > 0 ? (
                  [...logs].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((log: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full ${
                          log.action.includes('REFUND') || log.action.includes('FAILED') ? 'bg-red-500/10 text-red-400' : 
                          log.action.includes('RELEASE') || log.action.includes('SUCCESS') ? 'bg-green-500/10 text-green-400' : 
                          'bg-blue-500/10 text-blue-400'
                        }`}>
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{log.action.replace(/_/g, ' ')}</div>
                          <div className="text-xs text-muted-foreground">
                            {log.entityType?.replace(/_/g, ' ')}: {log.entityId} 
                            {log.metadata?.reason && ` - ${log.metadata.reason}`}
                            {log.metadata?.resolution && ` (${log.metadata.resolution})`}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{format(new Date(log.createdAt), "HH:mm:ss")}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No system logs available yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verifications" className="space-y-6">
          <Card className="border-white/5 bg-card/20">
            <CardHeader>
              <CardTitle>Pending Verifications</CardTitle>
              <CardDescription>Review ID documents and selfies submitted by users (Partners & Clients).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {verifications && verifications.length > 0 ? (
                  <div className="rounded-md border border-white/10 overflow-x-auto sleek-scroll">
                    <Table>
                      <TableHeader className="bg-white/5">
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-white">User</TableHead>
                          <TableHead className="text-white">Role</TableHead>
                          <TableHead className="text-white">ID Type</TableHead>
                          <TableHead className="text-white">ID Number</TableHead>
                          <TableHead className="text-white text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...verifications].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((v: any) => (
                          <TableRow key={v.userId} className="border-white/5 hover:bg-white/5 transition-colors">
                            <TableCell>
                              <div>
                                <div className="font-medium text-white">{v.user.firstName} {v.user.lastName}</div>
                                <div className="text-xs text-muted-foreground">{v.user.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                v.role === 'ESCORT' 
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              }>
                                {v.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="capitalize text-white/80">{v.verificationDocs.idType?.replace(/_/g, ' ') || 'N/A'}</TableCell>
                            <TableCell className="font-mono text-xs text-white/80">{v.verificationDocs.idNumber || 'N/A'}</TableCell>
                            <TableCell className="text-right">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => setSelectedVerification(v)}
                                    className="bg-white/5 border-white/10 hover:bg-white/10 text-white"
                                  >
                                    View Details
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-card border-white/10 text-white flex flex-col p-0 overflow-hidden">
                                  <DialogHeader className="p-4 sm:p-6 border-b border-white/10 shrink-0">
                                    <DialogTitle>Verification Review</DialogTitle>
                                    <DialogDescription className="text-muted-foreground text-sm">
                                      Review documentation for {v.user.firstName} {v.user.lastName} ({v.role})
                                    </DialogDescription>
                                  </DialogHeader>
                                  
                                  <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 sleek-scroll">
                                    {isRejecting ? (
                                      <div className="py-8 max-w-md mx-auto space-y-4">
                                        <div className="flex items-center gap-3 text-red-400 mb-2">
                                          <XCircle className="w-6 h-6" />
                                          <h3 className="text-lg font-semibold">Reject Verification</h3>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                          Please provide a reason for rejecting this {v.role.toLowerCase()}. This will be sent to them via email.
                                        </p>
                                        <div className="space-y-2 pt-2">
                                          <Label htmlFor="reject-reason">Rejection Reason</Label>
                                          <Textarea 
                                            id="reject-reason"
                                            placeholder="e.g., ID photo is blurry, Name mismatch..."
                                            value={rejectionReason}
                                            onChange={(e) => setRejectionReason(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white min-h-[120px]"
                                            autoFocus
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 py-4">
                                        <div className="space-y-6">
                                          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">User Information</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                              <div>
                                                <div className="text-muted-foreground text-xs">Full Name</div>
                                                <div className="font-medium text-white">{v.user.firstName} {v.user.lastName}</div>
                                              </div>
                                              <div>
                                                <div className="text-muted-foreground text-xs">Role</div>
                                                <div className="font-medium text-white">{v.role}</div>
                                              </div>
                                              <div>
                                                <div className="text-muted-foreground text-xs">Phone Number</div>
                                                <div className="font-medium text-white">{v.user.phone || 'N/A'}</div>
                                              </div>
                                              <div>
                                                <div className="text-muted-foreground text-xs">ID Type</div>
                                                <div className="font-medium capitalize text-white">{v.verificationDocs.idType?.replace(/_/g, ' ') || 'N/A'}</div>
                                              </div>
                                              <div>
                                                <div className="text-muted-foreground text-xs">ID Number</div>
                                                <div className="font-medium text-white">{v.verificationDocs.idNumber || 'N/A'}</div>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="space-y-3">
                                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ID Document Image</Label>
                                            <div className="aspect-[4/3] w-full rounded-xl border border-white/10 bg-black/40 overflow-hidden relative group">
                                              {v.verificationDocs.idImage ? (
                                                <>
                                                  <img 
                                                    src={v.verificationDocs.idImage} 
                                                    className="w-full h-full object-contain cursor-zoom-in"
                                                    onClick={() => window.open(v.verificationDocs.idImage, '_blank')}
                                                  />
                                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                    <span className="text-xs font-medium">Click to expand</span>
                                                  </div>
                                                </>
                                              ) : (
                                                <div className="flex items-center justify-center h-full text-muted-foreground">No image provided</div>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="space-y-6">
                                          <div className="space-y-3">
                                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Selfie Verification Image</Label>
                                            <div className="aspect-[4/3] w-full rounded-xl border border-white/10 bg-black/40 overflow-hidden relative group">
                                              {v.verificationDocs.selfieImage ? (
                                                <>
                                                  <img 
                                                    src={v.verificationDocs.selfieImage} 
                                                    className="w-full h-full object-contain cursor-zoom-in"
                                                    onClick={() => window.open(v.verificationDocs.selfieImage, '_blank')}
                                                  />
                                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                    <span className="text-xs font-medium">Click to expand</span>
                                                  </div>
                                                </>
                                              ) : (
                                                <div className="flex items-center justify-center h-full text-muted-foreground">No image provided</div>
                                              )}
                                            </div>
                                          </div>

                                          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                                            <div className="flex gap-3">
                                              <AlertCircle className="w-5 h-5 text-blue-400 shrink-0" />
                                              <p className="text-xs text-blue-200/70 leading-relaxed">
                                                Ensure the face in the selfie matches the ID photo and the details on the ID document are clearly legible and match the partner's profile name.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <DialogFooter className="flex-row gap-3 p-4 sm:p-6 border-t border-white/10 bg-card/80 backdrop-blur-sm shrink-0">
                                    {isRejecting ? (
                                      <>
                                        <Button 
                                          variant="ghost" 
                                          onClick={() => {
                                            setIsRejecting(false);
                                            setRejectionReason("");
                                          }}
                                          className="flex-1 text-muted-foreground hover:text-white hover:bg-white/5"
                                        >
                                          Back to Review
                                        </Button>
                                        <Button 
                                          variant="destructive"
                                          onClick={() => {
                                            if (rejectionReason) {
                                              rejectVerificationMutation.mutate({ userId: v.userId, reason: rejectionReason });
                                              setIsRejecting(false);
                                              setRejectionReason("");
                                            }
                                          }}
                                          disabled={!rejectionReason || rejectVerificationMutation.isPending}
                                          className="flex-1 sm:flex-none sm:min-w-[140px] h-11 sm:h-10"
                                        >
                                          {rejectVerificationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirm Rejection`}
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button 
                                          variant="destructive"
                                          onClick={() => setIsRejecting(true)}
                                          disabled={rejectVerificationMutation.isPending}
                                          className="flex-1 sm:flex-none sm:min-w-[140px] h-11 sm:h-10"
                                        >
                                          Reject {v.role === 'ESCORT' ? 'Companion' : 'Client'}
                                        </Button>
                                        <Button 
                                          onClick={() => approveVerificationMutation.mutate(v.userId)}
                                          disabled={approveVerificationMutation.isPending}
                                          className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none sm:min-w-[140px] h-11 sm:h-10"
                                        >
                                          {approveVerificationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Approve ${v.role === 'ESCORT' ? 'Companion' : 'Client'}`}
                                        </Button>
                                      </>
                                    )}
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-xl">
                    <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                    <h3 className="text-white font-medium">No Pending Verifications</h3>
                    <p className="text-sm text-muted-foreground mt-1">All partner submissions have been processed.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="w-5 h-5" /> Financial Controls
                </CardTitle>
                <CardDescription>Adjust fees and payout thresholds.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="comm">Platform Commission Rate (%)</Label>
                  <div className="flex gap-4">
                    <Input 
                      id="comm" 
                      value={platformFeeRate} 
                      onChange={(e) => setPlatformFeeRate(e.target.value)}
                      className="bg-white/5 border-white/10 text-white" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vfee">Escort Verification Fee (NGN)</Label>
                  <div className="flex gap-4">
                    <Input 
                      id="vfee" 
                      value={vfee} 
                      onChange={(e) => setVfee(e.target.value)}
                      className="bg-white/5 border-white/10 text-white" 
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                   <div>
                     <div className="text-sm font-medium text-red-200">Global Payout Kill-Switch</div>
                     <div className="text-xs text-red-300/60">Immediately pause all outgoing transfers.</div>
                   </div>
                   <Switch 
                     checked={payoutsPaused} 
                     onCheckedChange={setPayoutsPaused} 
                   />
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" /> Automation Rules
                </CardTitle>
                <CardDescription>Configure auto-release and dispute windows.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="release">Auto-Release Timeout (Hours)</Label>
                  <div className="flex gap-4">
                    <Input 
                      id="release" 
                      value={autoReleaseTimeout} 
                      onChange={(e) => setAutoReleaseTimeout(e.target.value)}
                      className="bg-white/5 border-white/10 text-white" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="window">Dispute Window (Minutes)</Label>
                  <div className="flex gap-4">
                    <Input 
                      id="window" 
                      value={disputeWindow} 
                      onChange={(e) => setDisputeWindow(e.target.value)}
                      className="bg-white/5 border-white/10 text-white" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius">Proximity Radius (KM)</Label>
                  <div className="flex gap-4">
                    <Input 
                      id="radius" 
                      value={proximityRadius} 
                      onChange={(e) => setProximityRadius(e.target.value)}
                      className="bg-white/5 border-white/10 text-white" 
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                   <div>
                     <div className="text-sm font-medium text-blue-200">Force Verify New Partners</div>
                     <div className="text-xs text-blue-300/60">Require manual ID check before activation.</div>
                   </div>
                   <Switch 
                     checked={requirePartnerApproval} 
                     onCheckedChange={setRequirePartnerApproval} 
                   />
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="mt-6 flex justify-end">
            <Button 
              onClick={handleSaveConfig} 
              disabled={updateSettingsMutation.isPending}
              className="bg-white text-black hover:bg-white/90 px-8 rounded-xl font-bold border-none"
            >
              {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save All Changes"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="disputes">
           <Card className="border-white/5 bg-card/20">
              <CardContent className="p-0">
                 <div className="overflow-x-auto sleek-scroll">
                    <table className="w-full text-sm text-left">
                       <thead className="text-xs text-muted-foreground uppercase border-b border-white/5">
                          <tr>
                             <th className="px-6 py-4">Booking ID</th>
                             <th className="px-6 py-4">Client</th>
                             <th className="px-6 py-4">Escort</th>
                             <th className="px-6 py-4">Reason</th>
                             <th className="px-6 py-4">Status</th>
                             <th className="px-6 py-4">Actions</th>
                          </tr>
                       </thead>
                       <tbody className="text-white divide-y divide-white/5">
                          {disputes?.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">No active disputes found.</td>
                            </tr>
                          )}
                          {[...(disputes || [])].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((dispute: any) => (
                            <tr key={dispute.id}>
                               <td className="px-6 py-4 font-mono text-xs">#{dispute.bookingId.substring(0, 8)}</td>
                               <td className="px-6 py-4">{dispute.client?.firstName} {dispute.client?.lastName}</td>
                               <td className="px-6 py-4">{dispute.escort?.firstName} {dispute.escort?.lastName}</td>
                               <td className="px-6 py-4">{dispute.reason}</td>
                               <td className="px-6 py-4">
                                  <Badge className={
                                    dispute.status === 'OPEN' 
                                      ? "bg-red-500/10 text-red-400 border-red-500/20" 
                                      : "bg-green-500/10 text-green-400 border-green-500/20"
                                  }>
                                    {dispute.status}
                                  </Badge>
                               </td>
                               <td className="px-6 py-4 space-x-2">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="h-8 border-white/10 hover:bg-white/5"
                                        onClick={() => setSelectedDispute(dispute)}
                                      >
                                        Details
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-card border-white/10 text-white">
                                       <DialogHeader>
                                          <DialogTitle>Dispute Resolution</DialogTitle>
                                          <DialogDescription className="text-muted-foreground">
                                             Reviewing dispute for booking #{dispute.bookingId.substring(0, 8)}
                                          </DialogDescription>
                                       </DialogHeader>
                                       <div className="space-y-4 py-4">
                                          <div className="grid grid-cols-2 gap-4">
                                             <div>
                                                <Label className="text-muted-foreground text-xs">Client</Label>
                                                <p className="text-sm font-medium">{dispute.client?.firstName} {dispute.client?.lastName}</p>
                                             </div>
                                             <div>
                                                <Label className="text-muted-foreground text-xs">Escort</Label>
                                                <p className="text-sm font-medium">{dispute.escort?.firstName} {dispute.escort?.lastName}</p>
                                             </div>
                                             <div className="col-span-2">
                                                <Label className="text-muted-foreground text-xs">Dispute Reason</Label>
                                                <p className="bg-white/5 p-3 rounded-lg mt-1 text-sm border border-white/5">{dispute.reason}</p>
                                             </div>
                                             {dispute.resolution && (
                                               <div className="col-span-2">
                                                  <Label className="text-muted-foreground text-xs">Resolution</Label>
                                                  <p className="bg-green-500/5 p-3 rounded-lg mt-1 text-sm border border-green-500/10 text-green-400">
                                                    {dispute.resolution} - {dispute.resolvedAt && format(new Date(dispute.resolvedAt), "MMM d, HH:mm")}
                                                  </p>
                                               </div>
                                             )}
                                          </div>
                                       </div>
                                       <DialogFooter className="gap-2">
                                          {dispute.status === 'OPEN' && (
                                            <>
                                              <Button 
                                                variant="destructive"
                                                onClick={() => resolveDisputeMutation.mutate({ id: dispute.id, resolution: 'REFUND' })}
                                                disabled={resolveDisputeMutation.isPending}
                                                className="flex-1"
                                              >
                                                Refund Client
                                              </Button>
                                              <Button 
                                                className="bg-white text-black hover:bg-white/90 flex-1"
                                                onClick={() => resolveDisputeMutation.mutate({ id: dispute.id, resolution: 'RELEASE' })}
                                                disabled={resolveDisputeMutation.isPending}
                                              >
                                                Release to Escort
                                              </Button>
                                            </>
                                          )}
                                       </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                               </td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card className="border-white/5 bg-card/20">
            <CardContent className="p-0">
              <div className="overflow-x-auto sleek-scroll">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead>Booking ID</TableHead>
                      <TableHead>Escort</TableHead>
                      <TableHead>Amount (NGN)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payoutsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : payouts?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                          No payouts found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...payouts].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((payout: any) => (
                        <TableRow key={payout.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="font-mono text-xs">#{payout.bookingId.substring(0, 8)}</TableCell>
                          <TableCell>
                            <div className="font-medium text-white">{payout.escortName || "Unknown"}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">#{payout.escortId.substring(0, 8)}</div>
                          </TableCell>
                          <TableCell className="font-medium text-green-400">₦{Number(payout.amount).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className={
                              payout.status === 'SUCCESS' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                              payout.status === 'FAILED' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                              "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                            }>
                              {payout.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]" title={payout.transferReference}>
                            {payout.transferReference}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(payout.createdAt), "MMM d, HH:mm")}
                          </TableCell>
                          <TableCell className="text-right">
                            {payout.status === 'FAILED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-white/10 hover:bg-white/5 gap-2"
                                onClick={() => retryPayoutMutation.mutate(payout.id)}
                                disabled={retryPayoutMutation.isPending}
                              >
                                {retryPayoutMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCcw className="w-3 h-3" />
                                )}
                                Retry
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="border-white/5 bg-card/20">
            <CardContent className="p-0">
              <div className="overflow-x-auto sleek-scroll">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Entity ID</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : logs?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                          No logs found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...logs].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((log: any) => (
                        <TableRow key={log.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="font-medium">{log.action?.replace(/_/g, ' ')}</TableCell>
                          <TableCell>{log.entityType?.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="font-mono text-xs">{log.entityId}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="broadcast">
          <Card className="border-white/5 bg-card/20">
            <CardHeader>
              <CardTitle>Global Broadcast</CardTitle>
              <CardDescription>Send a news message to all or specific groups of users.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-2">
                  <Label htmlFor="broadcast-target">Target Audience</Label>
                  <div className="flex gap-4">
                    {["ALL", "ESCORT", "CLIENT"].map((role) => (
                      <button
                        key={role}
                        onClick={() => setBroadcastTarget(role)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                          broadcastTarget === role
                            ? "bg-white text-black border-white"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {role === "ALL" ? "Everyone" : role === "ESCORT" ? "Partners Only" : "Clients Only"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broadcast-title">Title</Label>
                  <Input
                    id="broadcast-title"
                    placeholder="e.g., Platform Maintenance Update"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broadcast-body">Message Body</Label>
                  <Textarea
                    id="broadcast-body"
                    placeholder="Type your message here..."
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    className="bg-white/5 border-white/10 text-white min-h-[150px]"
                  />
                </div>

                <div className="pt-4">
                  <Button
                    onClick={() =>
                      broadcastMutation.mutate({
                        title: broadcastTitle,
                        body: broadcastBody,
                        targetRole: broadcastTarget === "ALL" ? undefined : broadcastTarget,
                      })
                    }
                    disabled={broadcastMutation.isPending || !broadcastTitle || !broadcastBody}
                    className="bg-white text-black hover:bg-white/90 px-8 rounded-xl font-bold w-full sm:w-auto"
                  >
                    {broadcastMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Megaphone className="w-4 h-4 mr-2" />
                    )}
                    Send Broadcast
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
