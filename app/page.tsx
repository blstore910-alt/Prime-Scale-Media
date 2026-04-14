import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();

  if (data.session) redirect("/dashboard");
  redirect("/auth/login");

  // return (
  //   <main className="min-h-screen flex flex-col items-center">
  //     <div className="flex-1 w-full flex flex-col gap-16 items-center">
  //       <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
  //         <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
  //           <div className="flex gap-5 items-center font-semibold">
  //             <Link href={"/"}>PSM Logbook</Link>
  //           </div>
  //           {!hasEnvVars ? <EnvVarWarning /> : <AuthButton />}
  //         </div>
  //       </nav>
  //       <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
  //         <Hero />
  //       </div>

  //       <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-6">
  //         <p>
  //           Powered by{" "}
  //           <a
  //             href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
  //             target="_blank"
  //             className="font-bold hover:underline"
  //             rel="noreferrer"
  //           >
  //             Supabase
  //           </a>
  //         </p>
  //         <ThemeSwitcher />
  //       </footer>
  //     </div>
  //   </main>
  // );
}
