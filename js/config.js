// Public (browser-safe) Supabase settings. The publishable key is designed to be public;
// all data access is protected by Row Level Security rules in the database.
export const SUPABASE_URL = 'https://gsbkqcmuikgqrohoeykr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_n2QP1-VmCMls_9WPaLnnyw_H6FTbKHy';
export const PAGE_SIZE = 16;
export const MAX_PHOTOS = 5;
export const MAX_WANTED = 3;
// Support inbox: Cloudflare Email Routing forwards it to the team's Gmail.
export const SUPPORT_EMAIL = 'team@rentads.lk';
// Social media pages, shown as icons in the footer. Keep sameAs in worker.js in step.
export const SOCIAL_LINKS = [
  { name: 'Facebook', icon: 'facebook', url: 'https://www.facebook.com/RentAds.lk/' },
  { name: 'Instagram', icon: 'instagram', url: 'https://www.instagram.com/rentads.lk/' },
  { name: 'TikTok', icon: 'tiktok', url: 'https://www.tiktok.com/@rentads.lk' },
];

// Google sign-in: the "Web application" OAuth client ID from Google Cloud Console (see README, Sign-in setup).
// While this is empty the Google button uses the normal redirect sign-in instead of the One Tap popup.
export const GOOGLE_CLIENT_ID = '116669773722-qsk5f8mo3gci5297qg1fek4plgl6480t.apps.googleusercontent.com';

// Better Stack error tracking (application "RentAds website"). This address can only send errors in,
// it cannot read anything, so it is safe in the browser. Empty it to switch error tracking off.
// If it changes, update the connect-src address in _headers (top folder) too.
export const ERROR_DSN = 'https://Yza8AUJRCWmJgM7cgEHStnpq@s2813877.us-west-2a.betterstackdata.com/2813877';

