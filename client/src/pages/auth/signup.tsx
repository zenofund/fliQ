import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import logo from "@assets/logo.png";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, InsertUser } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { LegalModal } from "@/components/legal-modal";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { user, registerMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean; type: "terms" | "privacy" }>({
    isOpen: false,
    type: "terms",
  });
  
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  // Extend the schema to include password confirmation or other client-side checks if needed
  // For now we'll use the insertUserSchema directly but we might need to handle role mapping
  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      role: "CLIENT",
      email: "",
      phone: "",
      passwordHash: "",
      // @ts-ignore
      firstName: "",
      // @ts-ignore
      lastName: ""
    },
  });

  const onSubmit = (data: InsertUser) => {
    // We map 'password' field from UI to 'passwordHash' in schema for transport (server will hash it)
    // Actually the schema expects 'passwordHash', but the UI should probably just say 'password'
    // Let's adjust the form to send what the server expects.
    // The server expects `password` in the body to hash it, but the schema defines `passwordHash`.
    // Wait, let's check server/auth.ts. It reads `req.body.password`.
    // But `insertUserSchema` has `passwordHash`.
    // We should probably create a client-side schema that has `password` instead of `passwordHash`.
    
    // For now, let's just send the data. The server auth.ts:
    // const passwordHash = await hashPassword(req.body.password);
    // const userData = insertUserSchema.parse({ ...req.body, passwordHash });
    
    // So we need to send `password` in the body.
    
    const { passwordHash, ...rest } = data;
    // @ts-ignore
    registerMutation.mutate({ ...rest, password: passwordHash });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Link href="/">
        <img src={logo} alt="fliQ" className="h-10 w-auto mb-8 cursor-pointer" />
      </Link>
      <Card className="w-full max-w-md border-white/10 bg-card/50 backdrop-blur-xl">
        <CardHeader className="space-y-1 py-4">
          <CardTitle className="text-2xl font-medium text-center">Create account</CardTitle>
          <CardDescription className="text-center font-normal">
            Choose your role and join the community
          </CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>I am a...</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="CLIENT" id="client" />
                          <Label htmlFor="client">Client</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="ESCORT" id="escort" />
                          <Label htmlFor="escort">Partner</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" className="bg-white/5 border-white/10" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" className="bg-white/5 border-white/10" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="m@example.com" className="bg-white/5 border-white/10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

               <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+234 800 000 0000" className="bg-white/5 border-white/10" {...field} />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                      Format: +234 followed by 10 digits (e.g., +234 800 000 0000)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passwordHash"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type={showPassword ? "text" : "password"} 
                          className="bg-white/5 border-white/10 pr-10" 
                          {...field} 
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full bg-white text-black hover:bg-white/90 h-9 rounded-xl font-medium border-none transition-all"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Account"}
              </Button>

              <div className="text-[11px] text-center text-muted-foreground px-4 leading-relaxed lg:whitespace-nowrap lg:scale-95 origin-center">
                By creating an account, you agree to our{" "}
                <button 
                  type="button"
                  onClick={() => setLegalModal({ isOpen: true, type: "terms" })}
                  className="text-white hover:underline font-normal"
                >
                  Terms of Service
                </button>
                {" "}and{" "}
                <button 
                  type="button"
                  onClick={() => setLegalModal({ isOpen: true, type: "privacy" })}
                  className="text-white hover:underline font-normal"
                >
                  Privacy Policy
                </button>.
              </div>
            </form>
          </Form>
        </CardContent>
        <CardFooter>
          <div className="text-sm text-center w-full text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login">
              <span className="text-white hover:underline cursor-pointer">Login</span>
            </Link>
          </div>
        </CardFooter>
      </Card>

      <LegalModal 
        isOpen={legalModal.isOpen} 
        onClose={() => setLegalModal(prev => ({ ...prev, isOpen: false }))}
        type={legalModal.type}
      />
    </div>
  );
}
