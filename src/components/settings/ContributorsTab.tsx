"use client";

import { Lock, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useContributors } from "@/hooks/useContributors";
import { useToast } from "@/providers/toast-provider";

export function ContributorsTab() {
  const { contributors, isLoading, addContributor, removeContributor } =
    useContributors();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [contributorToRemove, setContributorToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (
      contributors.some(
        (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      notify({
        title: "Already added",
        description: `${trimmed} is already a contributor.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      await addContributor(trimmed);
      setName("");
      notify({ title: "Contributor added", description: trimmed });
    } catch {
      notify({
        title: "Couldn't add contributor",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmRemove() {
    if (!contributorToRemove) return;
    const { id, name: contributorName } = contributorToRemove;
    setIsRemoving(true);
    try {
      await removeContributor(id);
      notify({ title: "Contributor removed", description: contributorName });
      setContributorToRemove(null);
    } catch {
      notify({
        title: "Couldn't remove contributor",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <>
    <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 p-5">
        <CardTitle className="text-sm font-semibold">Contributors</CardTitle>
        <CardDescription className="text-xs">
          Who can give Home/Family income — shown in the income form once you
          add someone besides yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3 text-xs text-sky-900 dark:text-sky-200">
          <Users className="mt-0.5 size-4 shrink-0" />
          <p>
            &ldquo;Me&rdquo; is always available and can&apos;t be removed. Add
            Brother, Father, or anyone else who contributes Home/Family income.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="e.g. Brother"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleAdd();
              }
            }}
          />
          <Button
            className="shrink-0 font-bold"
            disabled={isSaving || !name.trim()}
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add
          </Button>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading contributors…
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contributors.map((contributor) => (
                  <TableRow key={contributor.id}>
                    <TableCell className="font-medium">{contributor.name}</TableCell>
                    <TableCell className="text-right">
                      {contributor.isDefault ? (
                        <span
                          className="inline-flex size-8 items-center justify-center text-muted-foreground"
                          title="Me can't be removed"
                        >
                          <Lock className="size-3.5" />
                        </span>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            setContributorToRemove({
                              id: contributor.id,
                              name: contributor.name,
                            })
                          }
                        >
                          <Trash2 className="size-4 text-rose-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>

    <Dialog
      open={contributorToRemove !== null}
      onOpenChange={(open) => {
        if (!open) setContributorToRemove(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove contributor?</DialogTitle>
          <DialogDescription>
            &ldquo;{contributorToRemove?.name}&rdquo; will no longer appear in the
            Home/Family income picker. Existing transactions that reference them
            are not changed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setContributorToRemove(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-rose-500 text-white hover:bg-rose-600"
            disabled={isRemoving}
            onClick={() => void handleConfirmRemove()}
          >
            {isRemoving ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
