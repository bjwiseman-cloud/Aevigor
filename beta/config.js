// Public settings for the beta app. These two values are safe to publish: the anon key only allows
// what the database's Row Level Security rules allow (each person sees only their own rows).
// Fill them in from Supabase > Project Settings > API.
window.AEVIGOR_BETA = {
  supabaseUrl: '',   // e.g. https://abcdefghijkl.supabase.co
  anonKey: ''        // the "anon" / "publishable" key
};
