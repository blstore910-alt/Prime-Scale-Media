import AccountsTable from "@/components/account/accounts-table";

export default function Page() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <AccountsTable />
      </div>
    </div>
  );
}
