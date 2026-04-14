import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function InviteExpired() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("*, tenants(name, id)");
  const hasOrganizations = profiles?.length;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">This invitation has expired</h2>
        <p className="text-muted-foreground">
          Please contact the organization owner for a new invite.
        </p>
      </div>

      {hasOrganizations ? (
        <>
          <div className="grid w-full max-w-md gap-4 text-left">
            {profiles.map((profile) => (
              <Link
                key={profile.id}
                href={`/organization/${profile.tenants.id}`}
                className="block"
              >
                <Card className="transition hover:shadow-md">
                  <CardHeader className="flex flex-row items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {profile.tenants.name[0]?.toUpperCase() || "O"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{profile.tenants.name}</span>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>

          <Button asChild variant="outline">
            <Link href="/organization/new">Create New Organization</Link>
          </Button>
        </>
      ) : (
        <Button asChild>
          <Link href="/organization/new">Create New Organization</Link>
        </Button>
      )}
    </div>
  );
}
