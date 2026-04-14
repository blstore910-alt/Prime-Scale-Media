import UserTable from "@/components/admin/users/user-table";
import React from "react";

export default function Page() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <UserTable />
        </div>
      </div>
    </div>
  );
}
