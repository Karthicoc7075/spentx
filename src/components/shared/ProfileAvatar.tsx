"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutUser } from "@/lib/supabase-data";
import { useSupabaseAuth } from "@/providers/supabase-provider";
import { useToast } from "@/providers/toast-provider";

export function ProfileAvatar() {
  const { user, isConfigured } = useSupabaseAuth();
  const { notify } = useToast();
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "SX";

  async function handleSignOut() {
    try {
      await signOutUser();
      notify({ title: "Signed out" });
    } catch {
      notify({
        title: "Sign out failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="h-auto gap-3 px-2 py-1 cursor-pointer" variant="ghost">
            <Avatar className="size-8">
              <AvatarImage src={user?.photoUrl} />
              <AvatarFallback>{initials || "SX"}</AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 text-left md:block">
              <p className="truncate text-sm font-semibold">
                {user?.name ?? "Signed out"}
              </p>
              {user?.email ? (
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              ) : null}
            </div>
            <ChevronDown className="hidden size-3.5 text-muted-foreground md:block" />
          </Button>
        }
      />
      {isConfigured ? (
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}