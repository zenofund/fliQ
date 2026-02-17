import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "terms" | "privacy";
}

export function LegalModal({ isOpen, onClose, type }: LegalModalProps) {
  const content = {
    terms: {
      title: "Terms of Use",
      description: "Last updated: February 3, 2026",
      sections: [
        {
          heading: "1. Acceptance of Terms",
          text: "By accessing or using fliQ ('the Platform'), owned and operated by eLxis ('the Company'), you agree to comply with and be bound by these Terms of Use. If you do not agree, you must immediately cease all use of our services (fliq.top).",
        },
        {
          heading: "2. Eligibility & Verification",
          text: "You must be at least 18 years of age to use fliQ. We reserve the right to verify your identity and age at any time. Accounts found to be operated by minors will be terminated immediately without refund.",
        },
        {
          heading: "3. Nature of Service",
          text: "fliQ is a connector platform that facilitates interactions between users. The Company does not employ the service providers listed on the platform and is not responsible for the direct conduct of any user. Users interact at their own risk.",
        },
        {
          heading: "4. Payments & Escrow",
          text: "All payments made through fliQ are processed securely via our payment service provider. We utilize an escrow system to protect both parties. Funds are held by the platform and released only upon confirmed completion of the agreed-upon interaction or as per our refund policy.",
        },
        {
          heading: "5. Prohibited Activities",
          text: "Users are strictly prohibited from: (a) engaging in illegal activities under Nigerian law; (b) harassment, abuse, or physical harm to other users; (c) sharing fraudulent or misleading profile information; (d) bypassing the platform's payment system.",
        },
        {
          heading: "6. User Safety & Responsibility",
          text: "While we implement safety features like real-time GPS tracking and SOS alerts, users are responsible for their own personal safety. We strongly advise meeting in public places and informing trusted contacts of your location.",
        },
        {
          heading: "7. Limitation of Liability",
          text: "To the maximum extent permitted by Nigerian law, eLxis shall not be liable for any direct, indirect, incidental, or consequential damages resulting from your use of the platform or interactions with other users.",
        },
        {
          heading: "8. Account Termination",
          text: "We reserve the right to suspend or terminate any account that violates these terms, engages in suspicious activity, or receives multiple verified complaints from other community members.",
        },
        {
          heading: "9. Governing Law & Jurisdiction",
          text: "These terms are governed by the laws of the Federal Republic of Nigeria. Any disputes arising from the use of fliQ shall be subject to the exclusive jurisdiction of the courts in Nigeria.",
        },
      ],
    },
    privacy: {
      title: "Privacy Policy",
      description: "Last updated: February 3, 2026",
      sections: [
        {
          heading: "1. Introduction",
          text: "fliQ ('we', 'us', or 'our'), owned and operated by eLxis, is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and share information about you when you use our website (fliq.top) and mobile application.",
        },
        {
          heading: "2. Information We Collect",
          text: "We collect information you provide directly to us (name, email, phone number, age verification, and profile data). We also collect precise location data (GPS) to facilitate connections between users. We collect device information, IP addresses, and usage data via cookies and similar technologies.",
        },
        {
          heading: "3. How We Use Information",
          text: "We use your data to: facilitate connections; process secure escrow payments via our payment service provider; verify identity for safety; send push notifications; and comply with legal obligations under Nigerian law.",
        },
        {
          heading: "4. Data Sharing and Disclosure",
          text: "We do not sell your personal data. We share information with: other users (as per your profile settings); service providers (such as our payment processor for payments and our mapping service provider for mapping); and law enforcement when required by the laws of the Federal Republic of Nigeria.",
        },
        {
          heading: "5. Data Retention and Deletion",
          text: "We retain your data as long as your account is active. You may request account deletion at any time through your settings. Upon request, we will delete your personal data unless retention is required by law.",
        },
        {
          heading: "6. Children's Privacy",
          text: "fliQ is strictly for users aged 18 and older. We do not knowingly collect data from anyone under 18. If we become aware of such data collection, we will delete it immediately.",
        },
        {
          heading: "7. Security",
          text: "We use industry-standard encryption and security protocols (SSL/TLS) to protect your data. However, no method of transmission over the internet is 100% secure.",
        },
        {
          heading: "8. Jurisdiction",
          text: "This policy is governed by and construed in accordance with the laws of the Federal Republic of Nigeria, including the Nigeria Data Protection Act (NDPA).",
        },
      ],
    },
  };

  const currentContent = content[type];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] bg-card/95 border-white/10 backdrop-blur-xl text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{currentContent.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground italic">
            fliQ is owned and operated by eLxis. Official Website: fliq.top
          </DialogDescription>
          <div className="text-[10px] text-muted-foreground mt-1">
            {currentContent.description}
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4 mt-4">
          <div className="space-y-6">
            {currentContent.sections.map((section, index) => (
              <div key={index} className="space-y-2">
                <h3 className="font-semibold text-white/90">{section.heading}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.text}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
