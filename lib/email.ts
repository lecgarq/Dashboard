import "server-only";
import { google } from "googleapis";
import { getGoogleDriveOAuthConfig } from "@/lib/server/google-service-auth";
import { createGoogleIntegrationError } from "@/lib/server/integration-errors";
import { createLogger } from "@/lib/server/logger";

type MailConfig = {
  gmailUser: string;
  gmailOauthClientId: string;
  gmailOauthClientSecret: string;
  gmailRefreshToken: string;
  oauthRedirectUri: string;
};

let oauthClient: InstanceType<typeof google.auth.OAuth2> | null = null;
let gmailApi: ReturnType<typeof google.gmail> | null = null;
const logger = createLogger("email");

function getMailConfig(): MailConfig {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const driveConfig = getGoogleDriveOAuthConfig();

  const missing: string[] = [];
  if (!gmailUser) missing.push("GMAIL_USER");

  if (missing.length > 0) {
    logger.error("Missing Gmail config", { missing });
    throw new Error(`Missing Gmail email config: ${missing.join(", ")}`);
  }

  logger.debug("Resolved Gmail OAuth config", {
    gmailUser,
    clientIdPrefix: driveConfig.clientId.slice(0, 12),
  });

  return {
    gmailUser: gmailUser as string,
    gmailOauthClientId: driveConfig.clientId,
    gmailOauthClientSecret: driveConfig.clientSecret,
    gmailRefreshToken: driveConfig.refreshToken,
    oauthRedirectUri: driveConfig.redirectUri,
  };
}

function getGmailApi() {
  // Always recreate to pick up fresh env vars (refresh token changes, etc.)
  const cfg = getMailConfig();
  oauthClient = new google.auth.OAuth2(
    cfg.gmailOauthClientId,
    cfg.gmailOauthClientSecret,
    cfg.oauthRedirectUri
  );
  oauthClient.setCredentials({ refresh_token: cfg.gmailRefreshToken });
  gmailApi = google.gmail({ version: "v1", auth: oauthClient });
  return gmailApi;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const cfg = getMailConfig();
    const gmail = getGmailApi();
    logger.info("Sending email", { to, subject });
    const mime = [
      `From: BIM Dashboard <${cfg.gmailUser}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
    ].join("\r\n");
    const raw = Buffer.from(mime).toString("base64url");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    logger.info("Email sent", {
      to,
      subject,
      messageId: result.data.id ?? "unknown",
    });
  } catch (error) {
    const normalizedError = createGoogleIntegrationError("Gmail", error, {
      action: "send transactional email",
      reconnectMessage:
        "Email delivery is disconnected. Refresh the Gmail OAuth token before sending more mail.",
      unavailableMessage: "Email delivery is temporarily unavailable.",
      configMessage: "Email delivery is not configured.",
    });

    logger.error("Email send failed", {
      to,
      subject,
      error: normalizedError,
    });
    throw normalizedError;
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail(
    to,
    "Reset your BIM Dashboard password",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Password Reset</h2>
        <p>We received a request to reset your BIM Dashboard password.</p>
        <p>Click the button below to set a new password. The link expires in <strong>1 hour</strong>.</p>
        <a
          href="${resetUrl}"
          style="display:inline-block;margin:16px 0;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;"
        >
          Reset Password
        </a>
        <p style="color:#888;font-size:13px;">
          If you did not request a password reset, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard — Internal Tools</p>
      </div>
    `
  );
}

export async function sendWelcomeEmail(to: string, name: string | null | undefined): Promise<void> {
  const displayName = name || to;
  await sendEmail(
    to,
    "Welcome to BIM Dashboard",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Welcome, ${displayName}!</h2>
        <p>Your BIM Dashboard account has been created successfully.</p>
        <p>You can now log in with your username and password.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard — Internal Tools</p>
      </div>
    `
  );
}

export async function sendPendingRequestEmail(to: string, name: string | null | undefined): Promise<void> {
  const displayName = name || to;
  await sendEmail(
    to,
    "Your BIM Dashboard access request is pending",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Access Request Received</h2>
        <p>Hi ${displayName},</p>
        <p>We've received your request to access the BIM Dashboard. An administrator will review it shortly.</p>
        <p>You'll receive another email once your request has been processed.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard — Internal Tools</p>
      </div>
    `
  );
}

export async function sendApprovedEmail(to: string, name: string | null | undefined): Promise<void> {
  const displayName = name || to;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  await sendEmail(
    to,
    "Your BIM Dashboard access has been approved",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Access Approved!</h2>
        <p>Hi ${displayName},</p>
        <p>Great news — your request to access the BIM Dashboard has been <strong>approved</strong>.</p>
        <a
          href="${baseUrl}/login"
          style="display:inline-block;margin:16px 0;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;"
        >
          Log In Now
        </a>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard — Internal Tools</p>
      </div>
    `
  );
}

export async function sendDeclinedEmail(to: string, name: string | null | undefined): Promise<void> {
  const displayName = name || to;
  await sendEmail(
    to,
    "Your BIM Dashboard access request was not approved",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Access Request Not Approved</h2>
        <p>Hi ${displayName},</p>
        <p>Unfortunately, your request to access the BIM Dashboard was not approved at this time.</p>
        <p>If you believe this is a mistake, please contact your administrator.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard — Internal Tools</p>
      </div>
    `
  );
}

export async function sendAdminNotificationEmail(userEmail: string, userName: string | null | undefined): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const displayName = userName || "New User";
  await sendEmail(
    adminEmail,
    `New Access Request: ${displayName}`,
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">New Access Request</h2>
        <p>A new user has requested access to the BIM Dashboard:</p>
        <p><strong>Name:</strong> ${displayName}</p>
        <p><strong>Email:</strong> ${userEmail}</p>
        <p style="margin-top:24px;">
          You can approve or decline this request in the User Management settings.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard — Admin Notifications</p>
      </div>
    `
  );
}
