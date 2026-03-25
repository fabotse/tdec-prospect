import { Skeleton } from "@/components/ui/skeleton";

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-64px)] p-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="flex-1 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
