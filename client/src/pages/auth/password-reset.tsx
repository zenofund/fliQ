import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@assets/logo.png";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function PasswordReset() {
  const [isSent, setIsSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/forgot-password", { email });
      setIsSent(true);
      toast({ title: "Email sent!", description: "Check your inbox for reset instructions." });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send reset email. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Link href="/">
        <img src={logo} alt="fliQ" className="h-10 w-auto mb-8 cursor-pointer" />
      </Link>
      <Card className="w-full max-w-md border-white/10 bg-card/50 backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Reset password</CardTitle>
          <CardDescription className="text-center">
            {isSent 
              ? "We've sent a password reset link to your email." 
              : "Enter your email address and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isSent ? (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="m@example.com" 
                  className="bg-white/5 border-white/10" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-white text-black hover:bg-white/90"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Link"}
              </Button>
            </form>
          ) : (
            <Button 
              variant="outline" 
              className="w-full border-white/10 hover:bg-white/5" 
              onClick={() => setIsSent(false)}
              disabled={isLoading}
            >
              Resend email
            </Button>
          )}
        </CardContent>
        <CardFooter>
          <Link href="/auth/login">
            <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white cursor-pointer transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to login
            </div>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
