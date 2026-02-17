import { Link, useLocation } from "wouter";
import { ShieldCheck, User, Menu, X, Bell, Settings, LogOut } from "lucide-react";
import { useState } from "react";
import logo from "@assets/logo.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { NotificationBell } from "./notification-bell";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

import { cn } from "@/lib/utils";

export default function Layout({ children, compact = false, hideFooter = false }: { children: React.ReactNode, compact?: boolean, hideFooter?: boolean }) {
  const [location, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isEscort = user?.role === "ESCORT";

  const navLinks = [
    { href: "/", label: "Discover", public: true },
    { href: "/dashboard", label: "Dashboard", public: false },
    { href: "/messages", label: "Messages", public: false },
  ];

  const filteredLinks = navLinks.filter(link => link.public || !!user);

  const settingsHref = isEscort ? "/partner-settings" : "/profile";

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/auth/login");
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Navbar - Hidden on Mobile if compact */}
      <nav className={cn(
        "sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl",
        compact && "hidden md:block"
      )}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="relative h-8 overflow-hidden transition-opacity hover:opacity-90">
                <img src={logo} alt="fliQ" className="h-full w-auto object-contain" />
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {filteredLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <div className={`text-sm font-medium transition-colors hover:text-white cursor-pointer ${
                  location === link.href ? "text-white" : "text-muted-foreground"
                }`}>
                  {link.label}
                </div>
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="hidden md:flex items-center gap-4">
             {user ? (
               <>
                 <NotificationBell />
                 <Link href={isEscort ? "/partner-settings" : "/profile"}>
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex items-center justify-center border border-white/5 cursor-pointer hover:border-white/20 transition-all">
                      {user?.avatar ? (
                        <img src={user.avatar} className="w-full h-full object-cover" alt="Profile" />
                      ) : (
                        isEscort ? <Settings className="w-5 h-5 text-muted-foreground" /> : <User className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                 </Link>
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                   onClick={handleLogout}
                   disabled={logoutMutation.isPending}
                 >
                   <LogOut className="w-5 h-5" />
                 </Button>
               </>
             ) : (
              <Link href="/auth/login">
                <Button size="sm" className="bg-zinc-800 text-white hover:bg-zinc-700 px-5 font-medium border border-white/10 rounded-full transition-all">
                  Login
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu */}
          <div className="flex items-center gap-2 md:hidden">
            {user && <NotificationBell />}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-background border-l-white/10">
                <div className="flex flex-col gap-6 mt-8">
                  <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="h-7 mb-4 cursor-pointer">
                      <img src={logo} alt="fliQ" className="h-full w-auto object-contain" />
                    </div>
                  </Link>
                  {filteredLinks.map((link) => (
                    <Link key={link.href} href={link.href} onClick={() => setIsMobileMenuOpen(false)}>
                      <div className={`text-sm font-medium cursor-pointer transition-colors hover:text-white ${
                        location === link.href ? "text-white" : "text-muted-foreground"
                      }`}>
                        {link.label}
                      </div>
                    </Link>
                  ))}
                  {user ? (
                    <>
                      <div className="h-px bg-white/10 w-full my-1" />
                      <Link href={settingsHref} onClick={() => setIsMobileMenuOpen(false)}>
                         <div className="text-sm font-medium text-muted-foreground hover:text-white cursor-pointer">Account Settings</div>
                      </Link>
                      <div className="h-px bg-white/10 w-full my-1" />
                      <button 
                        onClick={handleLogout}
                        className="text-sm font-medium text-red-400 hover:text-red-300 cursor-pointer flex items-center gap-2 text-left"
                      >
                        <LogOut className="w-4 h-4" /> Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="h-px bg-white/10 w-full my-1" />
                      <Link href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                         <div className="text-sm font-medium text-white cursor-pointer">Login</div>
                      </Link>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className={cn(
        "container mx-auto px-4 animate-in fade-in zoom-in-95 duration-500",
        compact ? "py-0 md:py-12" : "py-8 md:py-12"
      )}>
        {children}
      </main>

      {/* Footer - Hidden on Mobile if compact */}
      {!hideFooter && (
        <footer className={cn(
          "border-t border-white/5 py-4 bg-background/50",
          compact && "hidden md:block"
        )}>
          <div className="container mx-auto px-4 flex items-center justify-center gap-3">
            <img src={logo} alt="fliQ" className="h-4 w-auto opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500" />
            <p className="text-[11px] text-muted-foreground">
              &copy; {new Date().getFullYear()} fliQ. Secure & Private.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
