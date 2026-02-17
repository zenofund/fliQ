import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, UserPlus, Trash2, Phone, User, ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function TrustedContacts() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const { data: contacts, isLoading } = useQuery<any[]>({
    queryKey: ["/api/trusted-contacts"],
  });

  const addContactMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string }) => {
      const res = await apiRequest("POST", "/api/trusted-contacts", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trusted-contacts"] });
      setNewName("");
      setNewPhone("");
      toast({
        title: "Contact Added",
        description: "Your trusted contact has been added successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/trusted-contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trusted-contacts"] });
      toast({
        title: "Contact Removed",
        description: "The trusted contact has been removed.",
      });
    },
  });

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) {
      toast({
        title: "Missing fields",
        description: "Please enter both name and phone number.",
        variant: "destructive",
      });
      return;
    }
    addContactMutation.mutate({ name: newName, phone: newPhone });
  };

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            <CardTitle>Trusted Contacts</CardTitle>
          </div>
          <CardDescription>
            Add up to 5 people you trust. They will be notified if you trigger an SOS alert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddContact} className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="contactName"
                    placeholder="e.g. John Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-white/5 border-white/10 pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="contactPhone"
                    placeholder="+234 800 000 0000"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="bg-white/5 border-white/10 pl-10"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Must be in international format: +234 800 000 0000
                </p>
              </div>
            </div>
            <Button
              type="submit"
              disabled={addContactMutation.isPending || (contacts?.length || 0) >= 5}
              className="w-full bg-white text-black hover:bg-white/90 gap-2"
            >
              {addContactMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Add Trusted Contact
            </Button>
            {contacts?.length >= 5 && (
              <p className="text-xs text-yellow-500 flex items-center gap-1 mt-2">
                <AlertTriangle className="w-3 h-3" />
                You have reached the limit of 5 trusted contacts.
              </p>
            )}
          </form>

          <div className="space-y-3">
            <Label>Your Trusted Contacts</Label>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : contacts?.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-white/10 rounded-xl bg-white/5">
                <p className="text-muted-foreground text-sm">No trusted contacts added yet.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {contacts?.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 group transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center text-white font-bold">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {contact.isRegistered && (
                        <Badge variant="outline" className="border-blue-500/50 text-blue-500 bg-blue-500/10 text-[10px]">
                          fliQ User
                        </Badge>
                      )}
                      {contact.isVerified && (
                        <Badge variant="outline" className="border-green-500/50 text-green-500 bg-green-500/10 text-[10px]">
                          Verified
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteContactMutation.mutate(contact.id)}
                        disabled={deleteContactMutation.isPending}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-500/20 bg-red-500/5 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <CardTitle className="text-red-500">SOS Emergency</CardTitle>
          </div>
          <CardDescription>
            In case of emergency, use the SOS button on your dashboard to instantly alert all your trusted contacts with your live location.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
