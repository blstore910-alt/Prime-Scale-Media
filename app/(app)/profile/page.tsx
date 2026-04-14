"use client";

import { Separator } from "@/components/ui/separator";
import ProfileForm from "@/components/profile/profile-form";

export default function AccountPage() {
  return (
    <div className="py-10 px-6 sm:px-10 space-y-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Update your personal and company information.
        </p>
      </div>

      <Separator />

      <ProfileForm />
    </div>
  );
}
