// Root layout — intentionally minimal. All locale-aware layout lives in
// app/[locale]/layout.tsx which wraps the actual application.
// This file only exists to satisfy Next.js's requirement for a root layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
