import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@assets/logo.png";
import { useState } from "react";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Get token from URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      return toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
    }

    if (password.length < 6) {
      return toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/reset-password", { token, password });
      setIsSuccess(true);
      toast({ title: "Success", description: "Your password has been reset." });
      setTimeout(() => setLocation("/auth/login"), 3000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password. The link may be invalid or expired.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md border-white/10 bg-card/50 backdrop-blur-xl text-center p-8">
          <CardTitle className="text-destructive mb-4">Invalid Link</CardTitle>
          <CardDescription>This password reset link is invalid or missing a token.</CardDescription>
          <Link href="/auth/login">
            <Button className="mt-6">Back to Login</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Link href="/">
        <img src={logo} alt="fliQ" className="h-10 w-auto mb-8 cursor-pointer" />
      </Link>
      <Card className="w-full max-w-md border-white/10 bg-card/50 backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">New Password</CardTitle>
          <CardDescription className="text-center">
            {isSuccess 
              ? "Password reset successful! Redirecting to login..." 
              : "Enter your new password below."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-4 text-green-500">
              <CheckCircle2 className="w-12 h-12 mb-2" />
              <p>You can now log in with your new password.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  className="bg-white/5 border-white/10" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  className="bg-white/5 border-white/10" 
                  required 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-white text-black hover:bg-white/90"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset Password"}
              </Button>
            </form>
          )}
        </CardContent>
        {!isSuccess && (
          <CardFooter>
            <Link href="/auth/login">
              <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white cursor-pointer transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to login
              </div>
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
