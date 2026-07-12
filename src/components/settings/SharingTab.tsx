"use client";

import { Check, Copy, Eye, Link2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePurposeShares } from "@/hooks/usePurposeShares";
import { usePurposes } from "@/hooks/usePurposes";
import { getOwnedShares } from "@/lib/purpose-shares";
import { getPurposeLabel } from "@/lib/purposes";
import { getOrCreateShareLink, sendPurposeShareInviteEmail } from "@/lib/firebase";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useToast } from "@/providers/toast-provider";

export function SharingTab() {
  const { user } = useAuthReady();
  const { purposes } = usePurposes();
  const { shares, inviteViewer, removeShare } = usePurposeShares();
  const { notify } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [viewerEmail, setViewerEmail] = useState("");
  const [purposeId, setPurposeId] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [createdLink, setCreatedLink] = useState<{
    url: string;
    email: string;
    emailSent: boolean;
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareToRevoke, setShareToRevoke] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const ownedShares = useMemo(
    () =>
      // Anonymous claims minted from a share link are internal bookkeeping;
      // the invite row itself (no viewerUid) is what the owner manages.
      getOwnedShares(shares, user?.id).filter(
        (share) => !(share.linkToken && share.viewerUid),
      ),
    [shares, user?.id],
  );

  const activePurposes = purposes.filter((purpose) => purpose.is_active !== false);

  async function handleInvite() {
    const email = viewerEmail.trim();
    if (!email || !purposeId) {
      notify({
        title: "Missing details",
        description: "Enter a viewer email and select a purpose.",
      });
      return;
    }

    setIsInviting(true);
    try {
      await inviteViewer(email, purposeId);
      const purposeName = getPurposeLabel(purposeId, purposes);
      const token = await getOrCreateShareLink({
        ownerId: user?.id,
        purposeId,
        purposeName,
        viewerEmail: email,
      });
      const shareUrl = `${window.location.origin}/share/${token}`;
      let emailSent = true;
      try {
        await sendPurposeShareInviteEmail({
          viewerEmail: email,
          purposeName,
          inviterName: user?.name,
          inviterEmail: user?.email,
          shareUrl,
        });
      } catch {
        // The share was created; only the email delivery failed.
        emailSent = false;
      }
      notify({
        title: "View link ready",
        description: emailSent
          ? `Invite email with the view link sent to ${email}.`
          : `Link created for ${email}, but the invite email couldn't be sent — copy and share it yourself.`,
      });
      setInviteOpen(false);
      setViewerEmail("");
      setPurposeId("");
      setLinkCopied(false);
      setCreatedLink({ url: shareUrl, email, emailSent });
    } catch (error) {
      notify({
        title: "Invite failed",
        description:
          error instanceof Error ? error.message : "Could not create the share.",
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleConfirmRevoke() {
    if (!shareToRevoke) return;
    const { id, email } = shareToRevoke;
    setIsRevoking(true);
    try {
      await removeShare(id);
      notify({
        title: "Access revoked",
        description: `${email} can no longer view shared data.`,
      });
      setShareToRevoke(null);
    } catch (error) {
      notify({
        title: "Revoke failed",
        description:
          error instanceof Error ? error.message : "Could not revoke access.",
      });
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <>
      <Card className="rounded-3xl border-border bg-white dark:border-border dark:bg-card shadow-sm">
        <CardHeader className="border-b border-border/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold">Sharing</CardTitle>
              <CardDescription className="text-xs">
                Invite read-only viewers to specific purposes.
              </CardDescription>
            </div>
            <Button
              className="font-bold"
              onClick={() => setInviteOpen(true)}
            >
              <Plus className="mr-1.5 size-3.5" />
              Invite Viewer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3 text-xs text-sky-900 dark:text-sky-200">
            <Eye className="mt-0.5 size-4 shrink-0" />
            <p>
              Viewers can see transactions and reports for the shared purpose only.
              They cannot add, edit, or delete anything.
            </p>
          </div>

          {ownedShares.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No viewers invited yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownedShares.map((share) => (
                    <TableRow key={share.id}>
                      <TableCell className="font-medium">{share.viewerEmail}</TableCell>
                      <TableCell>
                        {getPurposeLabel(share.purposeId, purposes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(share.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            setShareToRevoke({
                              id: share.id,
                              email: share.viewerEmail,
                            })
                          }
                        >
                          <Trash2 className="size-4 text-rose-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite viewer</DialogTitle>
            <DialogDescription>
              Share read-only access to one purpose. You&apos;ll get a private view
              link — anyone opening it can see the transactions without signing in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="viewer-email">Viewer email</Label>
              <Input
                id="viewer-email"
                placeholder="brother@email.com"
                type="email"
                value={viewerEmail}
                onChange={(event) => setViewerEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="share-purpose">Purpose</Label>
              <select
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                id="share-purpose"
                value={purposeId}
                onChange={(event) => setPurposeId(event.target.value)}
              >
                <option value="">Select purpose</option>
                {activePurposes.map((purpose) => (
                  <option key={purpose.id} value={purpose.id}>
                    {purpose.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isInviting} type="button" onClick={() => void handleInvite()}>
              {isInviting ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdLink !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>View-only link ready</DialogTitle>
            <DialogDescription>
              {createdLink?.emailSent
                ? `The link was emailed to ${createdLink?.email}. You can also copy and share it directly.`
                : `The invite email to ${createdLink?.email} couldn't be sent — copy the link below and share it with them.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate font-mono text-xs">
              {createdLink?.url}
            </p>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                if (!createdLink) return;
                void navigator.clipboard.writeText(createdLink.url).then(() => {
                  setLinkCopied(true);
                });
              }}
            >
              {linkCopied ? (
                <Check className="mr-1 size-3.5 text-emerald-500" />
              ) : (
                <Copy className="mr-1 size-3.5" />
              )}
              {linkCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone with this link can view past and future transactions for the
            shared purpose — view only, no edits. Revoke access anytime from the
            table.
          </p>
          <DialogFooter>
            <Button type="button" onClick={() => setCreatedLink(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={shareToRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setShareToRevoke(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke access?</DialogTitle>
            <DialogDescription>
              {shareToRevoke?.email} will no longer be able to view the shared
              purpose. You can re-invite them at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShareToRevoke(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-rose-500 text-white hover:bg-rose-600"
              disabled={isRevoking}
              onClick={() => void handleConfirmRevoke()}
            >
              {isRevoking ? "Revoking…" : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}