"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useDebounce } from "use-debounce";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { createClient } from "@/lib/supabase/client";
import { generateSlug, getInitials } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type FormValues = {
  name: string;
  slug: string;
};

export default function CreateOrganization() {
  const supabase = createClient();

  const {
    register,
    watch,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { name: "", slug: "" },
  });

  const tenantName = watch("name");
  const tenantSlug = watch("slug");
  const [debouncedSlug] = useDebounce(watch("slug"), 1000);
  const router = useRouter();

  const [available, setAvailable] = useState<null | boolean>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", debouncedSlug)
        .maybeSingle();

      if (error) {
        console.error("Slug check error:", error);
        setAvailable(null);
      } else {
        setAvailable(!data);
      }

      setLoading(false);
    };
    if (debouncedSlug) checkAvailability();
  }, [debouncedSlug, supabase]);

  useEffect(() => {
    setValue("slug", generateSlug(tenantName));
  }, [tenantName, setValue]);

  const onSubmit = async (values: FormValues) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("User not authenticated");
    }

    const userId = session.user.id;

    const { data, error } = await supabase
      .from("tenants")
      .insert([
        {
          name: values.name,
          slug: values.slug,
          owner_id: userId,
          initials: getInitials(values.name),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    if (data) {
      router.push("/dashboard");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Organization</CardTitle>
        <CardDescription>
          Create your organization to get started. This will be the container
          for your projects, members and settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
          <label className="block text-sm font-medium">Organization name</label>
          <Input
            placeholder="Acme Co"
            aria-label="Organization name"
            maxLength={40}
            {...register("name")}
          />

          <div className="text-sm text-muted-foreground flex justify-between items-center gap-2">
            <span className="font-medium">{tenantSlug}</span>
            {loading && <Loader2 size={20} className="animate-spin" />}
            {!loading && available === true && tenantName && (
              <span className="text-green-600">✔ Available</span>
            )}
            {!loading && available === false && (
              <span className="text-red-600">✘ Already taken</span>
            )}
          </div>

          <div className="pt-4 text-end">
            <Button
              type="submit"
              disabled={isSubmitting || available === false}
            >
              Create Organization
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
