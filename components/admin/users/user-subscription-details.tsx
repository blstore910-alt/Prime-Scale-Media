import React from "react";
import dayjs from "dayjs";
import { DATE_FORMAT } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface Subscription {
  amount: number;
  /** Subscriptions default to EUR everywhere else in the app. */
  currency?: string | null;
  start_date: string;
  status: string;
}

interface UserSubscriptionDetailsProps {
  subscriptions: Subscription[] | null;
}

export default function UserSubscriptionDetails({
  subscriptions,
}: UserSubscriptionDetailsProps) {
  if (!subscriptions || subscriptions.length === 0) {
    return (
      <div className="">
        <h3 className=" font-semibold mb-2">Subscription</h3>
        <div className="text-muted-foreground text-center p-4 rounded-md border">
          No subscription found for this user.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold">Subscription</h3>
      <div className="space-y-4">
        {subscriptions.map((sub, index) => (
          <div key={index} className="border rounded-md p-3">
            <div className=" gap-2 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">
                  Start Date:
                </span>{" "}
                {dayjs(sub.start_date).format(DATE_FORMAT)}
              </div>
              <div>
                <span className="font-medium text-muted-foreground">
                  Price:
                </span>{" "}
                {/* This used to be a hard-coded "$". Subscriptions are EUR
                    by default (subscription_from_invite, subscription_billing
                    both coalesce to 'EUR'), so a EUR 500 plan read "$500" in
                    this drawer while /subscriptions showed "€500" — a ~15%
                    misstatement of a recurring charge, on a screen an admin
                    uses to answer billing questions. */}
                {formatCurrency(sub.amount, (sub.currency ?? "EUR").toUpperCase())}
              </div>
              <div>
                <span className="font-medium text-muted-foreground">
                  Status:
                </span>{" "}
                <Badge className="capitalize" variant={"outline"}>
                  {sub.status}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
