// User-facing route group layout (Dashboard at "/", Transactions, Analysis, Plan,
// Wealth, Outings, Friends, Alerts, Settings, Journal, Growth).
// Both normal users and the admin (in User View mode) can access these standard
// website interfaces seamlessly.
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

