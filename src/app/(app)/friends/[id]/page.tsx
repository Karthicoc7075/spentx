"use client";

import { use } from "react";
import { FriendDetailPage } from "@/components/friends/FriendDetailPage";
import { useFriends } from "@/hooks/useFriends";

export default function FriendDetailRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { friends, isLoading } = useFriends();
  const friend = friends.find((item) => item.id === id);

  if (!isLoading && !friend) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
        This friend has been deleted. Their past outings and split expenses are
        still visible on those pages.
      </div>
    );
  }

  if (!friend) {
    return null;
  }

  return <FriendDetailPage friend={friend} />;
}
