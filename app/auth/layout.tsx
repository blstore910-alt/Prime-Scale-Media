import Image from "next/image";

// Shared shell for every /auth screen (login, sign-up, reset, update
// password, error). Split layout: a PSM brand panel on the left
// (desktop only) and the form on the right. Purely presentational —
// the individual auth pages/forms are untouched and simply render as
// {children} in the form column.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-svh w-full grid-cols-1 lg:grid-cols-2">
      {/* Brand panel — hidden on mobile */}
      <div
        className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:items-center lg:justify-center"
        style={{
          backgroundImage: "linear-gradient(150deg, #4a7bff 0%, #6b6bff 45%, #7c46f0 100%)",
        }}
      >
        {/* soft light accents */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(600px 300px at 20% 15%, rgba(255,255,255,0.22), transparent 60%), radial-gradient(700px 380px at 85% 90%, rgba(255,255,255,0.12), transparent 60%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-6 px-10 text-center">
          <Image
            src="/images/psm-logo.svg"
            width={140}
            height={140}
            alt="Prime Scale Media"
            className="h-24 w-auto drop-shadow-lg"
            priority
          />
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              Prime Scale Media
            </h1>
            <p className="mx-auto mt-3 max-w-xs text-sm text-white/85">
              Your ad accounts, wallet and top-ups — managed in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Form column — soft brand wash behind the auth card */}
      <div
        className="relative bg-background"
        style={{
          backgroundImage:
            "radial-gradient(900px 500px at 50% -8%, rgba(91,141,255,0.16), transparent 60%), radial-gradient(700px 500px at 50% 108%, rgba(139,92,246,0.12), transparent 60%)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
