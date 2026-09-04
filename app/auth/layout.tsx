// Shared shell for every /auth screen (login, sign-up, reset, update
// password, error). Adds a soft PSM brand wash behind the centered
// auth card without touching the individual pages — purely visual.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="min-h-svh w-full bg-background"
      style={{
        backgroundImage:
          "radial-gradient(1100px 600px at 50% -8%, rgba(91,141,255,0.18), transparent 60%), radial-gradient(900px 600px at 50% 108%, rgba(139,92,246,0.14), transparent 60%)",
      }}
    >
      {children}
    </div>
  );
}
