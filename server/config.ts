export const config = {
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,
  bearerToken: process.env.BEARER_TOKEN,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  port: parseInt(process.env.PORT || '3000', 10),
};
