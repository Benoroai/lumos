import "@testing-library/jest-dom/vitest";

// Public env is validated at import time; supply safe placeholders so unit
// tests never depend on a real Supabase project being configured.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
