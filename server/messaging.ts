import twilio from "twilio";
import { log } from "./utils";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

let client: any = null;
try {
  if (TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID.startsWith('AC') && TWILIO_AUTH_TOKEN) {
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } else {
    log("Twilio credentials missing or invalid (must start with AC). Running in mock mode.", "messaging");
  }
} catch (error: any) {
  log(`Twilio initialization failed: ${error.message}. Running in mock mode.`, "messaging");
  client = null;
}

/**
 * Sends an SOS alert via SMS and WhatsApp using Twilio.
 * If credentials are missing, it logs the message to the console (Development Mode).
 */
export async function sendSosMessagingAlert(to: string, message: string) {
  const formattedTo = to.startsWith("+") ? to : `+${to}`;
  
  if (!client) {
    log(`[MOCK MESSAGING] To: ${formattedTo}, Message: ${message}`, "messaging");
    return { success: true, mock: true };
  }

  try {
    const results = await Promise.allSettled([
      // Send SMS
      TWILIO_PHONE_NUMBER ? client.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: formattedTo
      }) : Promise.reject("TWILIO_PHONE_NUMBER missing"),

      // Send WhatsApp
      TWILIO_WHATSAPP_NUMBER ? client.messages.create({
        body: message,
        from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${formattedTo}`
      }) : Promise.reject("TWILIO_WHATSAPP_NUMBER missing")
    ]);

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map(r => r.reason);

    if (errors.length > 0) {
      log(`Messaging partial failure: ${errors.join(", ")}`, "messaging");
    }

    return { 
      success: results.some(r => r.status === "fulfilled"),
      details: results
    };
  } catch (error: any) {
    log(`Messaging critical failure: ${error.message}`, "messaging");
    return { success: false, error: error.message };
  }
}

/**
 * Sends a verification link to a trusted contact.
 */
export async function sendContactVerificationLink(to: string, userName: string, link: string) {
  const message = `Hello! ${userName} has added you as a trusted contact on fliQ. Please click here to confirm: ${link}`;
  return sendSosMessagingAlert(to, message);
}

/**
 * Sends a verification code via SMS/WhatsApp.
 */
export async function sendVerificationMessage(to: string, code: string) {
  const message = `Your fliQ verification code is: ${code}`;
  return sendSosMessagingAlert(to, message);
}
