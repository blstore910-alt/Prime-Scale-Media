"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { WalletWithAdvertiser } from "@/lib/types/wallet";

const formSchema = z.object({
  usd_balance: z.coerce.number().min(0, "USD balance must be 0 or greater"),
  eur_balance: z.coerce.number().min(0, "EUR balance must be 0 or greater"),
});

type FormValues = z.infer<typeof formSchema>;

export default function WalletEditDialog({
  open,
  onOpenChange,
  wallet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletWithAdvertiser | null;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      usd_balance: 0,
      eur_balance: 0,
    },
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
  });

  useEffect(() => {
    if (!open || !wallet) return;
    reset({
      usd_balance: Number(wallet.usd_balance ?? 0),
      eur_balance: Number(wallet.eur_balance ?? 0),
    });
  }, [open, wallet, reset]);

  const { mutate, isPending } = useMutation({
    mutationKey: ["wallet-edit", wallet?.id],
    mutationFn: async (values: FormValues) => {
      if (!wallet?.id) throw new Error("Wallet not found.");
      const supabase = createClient();
      const { error } = await supabase
        .from("wallets")
        .update({
          usd_balance: Number(values.usd_balance.toFixed(2)),
          eur_balance: Number(values.eur_balance.toFixed(2)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", wallet.id);

      if (error) throw error;
      return wallet.id;
    },
    onSuccess: (walletId) => {
      toast.success("Wallet balances updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-details", walletId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Failed to update wallet", { description: error.message });
    },
  });

  const handleSave = (values: FormValues) => {
    mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit wallet balances</DialogTitle>
          <DialogDescription>
            Update USD and EUR balances for{" "}
            {wallet?.advertiser?.tenant_client_code ?? "selected wallet"}.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(handleSave)}>
          <div className="grid gap-2">
            <Label htmlFor="edit-wallet-usd">USD balance</Label>
            <Input
              id="edit-wallet-usd"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              {...register("usd_balance")}
            />
            {errors.usd_balance && (
              <p className="text-sm text-destructive">
                {errors.usd_balance.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-wallet-eur">EUR balance</Label>
            <Input
              id="edit-wallet-eur"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              {...register("eur_balance")}
            />
            {errors.eur_balance && (
              <p className="text-sm text-destructive">
                {errors.eur_balance.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !wallet}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
