import InvitesList from "@/components/onboard/invites-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: invites, error } = await supabase
    .from("invitations")
    .select("*, tenant:tenants(*)");

  if (error) throw new Error(error.message);

  return (
    <main className="max-w-lg mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Get started</CardTitle>
          <CardDescription>
            {
              "You've received invitations from other organizations. Choose one to be a part of, or continue by creating a new one."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvitesList invites={invites} />
          {/* <div className="mt-6 text-center text-muted-foreground space-y-6 ">
            <h6>OR</h6>
            <Button asChild>
              <Link href="/organization/new">Create New Organization</Link>
            </Button>
          </div> */}
        </CardContent>
      </Card>
    </main>
  );
}
