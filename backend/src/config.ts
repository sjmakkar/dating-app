import dotenv from 'dotenv';
dotenv.config();

function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : Number(v);
}

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  port: num('PORT', 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/dating_app',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
    accessTtl: num('ACCESS_TOKEN_TTL', 900),
    refreshTtl: num('REFRESH_TOKEN_TTL', 2592000),
  },

  discovery: {
    radiusKm: num('DISCOVERY_RADIUS_KM', 50),
    pageSize: num('DISCOVERY_PAGE_SIZE', 20),
  },
  launchCity: process.env.LAUNCH_CITY ?? 'Bengaluru',

  providers: {
    otpDevCode: process.env.OTP_DEV_CODE ?? '000000',
    googleClientIds: list(process.env.GOOGLE_CLIENT_IDS ?? process.env.GOOGLE_CLIENT_ID),
    appleClientIds: list(process.env.APPLE_CLIENT_IDS ?? process.env.APPLE_CLIENT_ID),
  },

  chat: {
    provider: process.env.CHAT_PROVIDER ?? 'stub',
    apiKey: process.env.CHAT_API_KEY ?? '',
    apiSecret: process.env.CHAT_API_SECRET ?? '',
  },

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'photos',
  },

  sms: {
    provider: process.env.SMS_PROVIDER ?? 'stub',
    apiKey: process.env.SMS_API_KEY ?? '',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? '',
  },
};
