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
import { cn } from "@/lib/utils";
import { useContributors } from "@/hooks/useContributors";
import { usePurposeShares } from "@/hooks/usePurposeShares";
import { usePurposes } from "@/hooks/usePurposes";
import {
  computeShareExpiresAt,
  findActiveShareForInvite,
  getOwnedShares,
  shareExpiryOptions,
  type ShareExpiryPreset,
} from "@/lib/purpose-shares";
import { getPurposeLabel } from "@/lib/purposes";
import { getOrCreateShareLink, sendPurposeShareInviteEmail } from "@/lib/supabase-data";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useToast } from "@/providers/toast-provider";
import type { PurposeShare } from "@/types";

export function SharingTab() {
  const { user } = useAuthReady();
  const { purposes } = usePurposes();
  const { contributors } = useContributors();
  const { shares, inviteViewer, removeShare } = usePurposeShares();
  const { notify } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareMethod, setShareMethod] = useState<"link" | "email">("link");
  const [viewerEmail, setViewerEmail] = useState("");
  const [purposeId, setPurposeId] = useState("");
  const [contributorId, setContributorId] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<ShareExpiryPreset>("always");
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
    purposeId: string;
  } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  const ownedShares = useMemo(
    () =>
      getOwnedShares(shares, user?.id).filter(
        (share) =>
          !(share.linkToken && share.viewerUid) &&
          share.status !== "revoked",
      ),
    [shares, user?.id],
  );

  const activePurposes = purposes.filter((purpose) => purpose.isActive !== false);

  async function handleInvite() {
    if (!purposeId) {
      notify({
        title: "Purpose required",
        description: "Please select a purpose to share.",
      });
      return;
    }

    if (shareMethod === "link") {
      // Rule 1: Maximum 3 active share links per purpose
      const activePurposeLinks = ownedShares.filter(
        (share) => share.purposeId === purposeId && share.status !== "revoked"
      );

      if (activePurposeLinks.length >= 3) {
        notify({
          title: "Maximum 3 links reached",
          description:
            "Maximum 3 active share links allowed for this purpose. Delete an existing link to generate a new one.",
          variant: "destructive",
        });
        return;
      }

      setIsInviting(true);
      try {
        const purposeName = getPurposeLabel(purposeId, purposes);
        const expiresAt = computeShareExpiresAt(expiryPreset);
        const placeholderEmail = `link-share-${Date.now().toString().slice(-4)}@spentx.app`;

        const token = await getOrCreateShareLink({
          ownerId: user?.id,
          purposeId,
          purposeName,
          viewerEmail: placeholderEmail,
          contributorId: contributorId || null,
          expiresAt,
        });

        await inviteViewer(placeholderEmail, purposeId, token, contributorId || null, expiresAt);
        const shareUrl = `${window.location.origin}/share/${token}`;

        notify({
          title: "Share link generated",
          description: `View link created for ${purposeName}. You can copy and share it directly.`,
        });

        setInviteOpen(false);
        setPurposeId("");
        setContributorId("");
        setExpiryPreset("always");
        setLinkCopied(false);
        setCreatedLink({ url: shareUrl, email: placeholderEmail, emailSent: false });
      } catch (error) {
        notify({
          title: "Link generation failed",
          description:
            error instanceof Error ? error.message : "Could not create share link.",
          variant: "destructive",
        });
      } finally {
        setIsInviting(false);
      }
      return;
    }

    // Rule 2: Email Invite Mode — 1 invite per email per purpose
    const email = viewerEmail.trim();
    if (!email) {
      notify({
        title: "Viewer email required",
        description: "Please enter a valid email address.",
      });
      return;
    }

    const existingEmailInvite = findActiveShareForInvite(shares, user?.id, purposeId, email);
    if (existingEmailInvite) {
      notify({
        title: "Invite already sent",
        description:
          "An invite for this purpose has already been sent to this email. Delete the old invite first, or invite a new email/purpose.",
        variant: "destructive",
      });
      return;
    }

    setIsInviting(true);
    try {
      const purposeName = getPurposeLabel(purposeId, purposes);
      const expiresAt = computeShareExpiresAt(expiryPreset);
      const token = await getOrCreateShareLink({
        ownerId: user?.id,
        purposeId,
        purposeName,
        viewerEmail: email,
        contributorId: contributorId || null,
        expiresAt,
      });

      await inviteViewer(email, purposeId, token, contributorId || null, expiresAt);
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
      } catch (emailError) {
        console.error("[SharingTab] invite email failed:", emailError);
        emailSent = false;
      }

      notify({
        title: "Invite sent",
        description: emailSent
          ? `Invite email with the view link sent to ${email}.`
          : `Link created for ${email}, but the invite email couldn't be sent — copy and share it directly.`,
      });

      setInviteOpen(false);
      setViewerEmail("");
      setPurposeId("");
      setContributorId("");
      setExpiryPreset("always");
      setLinkCopied(false);
      setCreatedLink({ url: shareUrl, email, emailSent });
    } catch (error) {
      notify({
        title: "Invite failed",
        description:
          error instanceof Error ? error.message : "Could not create the share.",
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleCopyLink() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink.url);
      setLinkCopied(true);
      notify({ title: "Link copied" });
    } catch {
      // navigator.clipboard requires a secure context (HTTPS/localhost) and
      // can also fail without clipboard-write permission — surface it
      // instead of leaving the button looking like it did nothing.
      notify({
        title: "Couldn't copy automatically",
        description: "Select and copy the link manually.",
        variant: "destructive",
      });
    }
  }

  async function handleCopyShareLink(share: PurposeShare) {
    try {
      // Reuse the token already recorded on this invite; only shares
      // created before that existed need to look the link back up.
      const token =
        share.linkToken ??
        (await getOrCreateShareLink({
          ownerId: user?.id,
          purposeId: share.purposeId,
          purposeName: getPurposeLabel(share.purposeId, purposes),
          viewerEmail: share.viewerEmail,
          contributorId: share.contributorId ?? null,
        }));
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setCopiedShareId(share.id);
      window.setTimeout(() => setCopiedShareId((current) => (current === share.id ? null : current)), 2000);
      notify({ title: "Link copied" });
    } catch (error) {
      notify({
        title: "Couldn't copy the link",
        description:
          error instanceof Error ? error.message : "Select and copy it manually.",
        variant: "destructive",
      });
    }
  }

  async function handleConfirmRevoke() {
    if (!shareToRevoke) return;
    const { id, email, purposeId: revokePurposeId } = shareToRevoke;
    setIsRevoking(true);
    try {
      await removeShare(id, revokePurposeId, email);
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
      <Card>
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
                    <TableHead>Contributor</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Last viewed</TableHead>
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
                        {share.contributorId
                          ? contributors.find((item) => item.id === share.contributorId)
                              ?.name ?? "—"
                          : "All"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(share.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {share.expiresAt
                          ? new Date(share.expiresAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {share.lastViewedAt
                          ? `${new Date(share.lastViewedAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })} · ${share.totalViews ?? 0} view${share.totalViews === 1 ? "" : "s"}`
                          : "Not yet viewed"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          aria-label="Copy share link"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => void handleCopyShareLink(share)}
                        >
                          {copiedShareId === share.id ? (
                            <Check className="size-4 text-emerald-500" />
                          ) : (
                            <Copy className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          aria-label="Revoke access"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            setShareToRevoke({
                              id: share.id,
                              email: share.viewerEmail,
                              purposeId: share.purposeId,
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
            <DialogTitle>Share Purpose Data</DialogTitle>
            <DialogDescription>
              Share read-only access to one purpose via direct view link or email invite.
            </DialogDescription>
          </DialogHeader>

          {/* Share Method Segmented Control */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setShareMethod("link")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer",
                shareMethod === "link"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Link2 className="size-3.5" />
              <span>Generate Link Only</span>
            </button>
            <button
              type="button"
              onClick={() => setShareMethod("email")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer",
                shareMethod === "email"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="size-3.5" />
              <span>Send Email Invite</span>
            </button>
          </div>

          <div className="grid gap-3 py-2">
            {shareMethod === "email" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="viewer-email">Viewer email</Label>
                <Input
                  id="viewer-email"
                  placeholder="brother@email.com"
                  type="email"
                  value={viewerEmail}
                  onChange={(event) => setViewerEmail(event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  One invite per email per purpose. Delete an old invite to re-send.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                <p className="font-semibold">🔗 Link Only Share Rule:</p>
                <p className="mt-0.5 text-muted-foreground">
                  Generates a direct read-only view link. Maximum <strong>3 active links allowed per purpose</strong>. Delete an old link if you need a new one.
                </p>
              </div>
            )}

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

            {contributors.length > 1 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="share-contributor">Contributor</Label>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  id="share-contributor"
                  value={contributorId}
                  onChange={(event) => setContributorId(event.target.value)}
                >
                  <option value="">All contributors</option>
                  {contributors.map((contributor) => (
                    <option key={contributor.id} value={contributor.id}>
                      {contributor.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Narrow the share to just this contributor&apos;s transactions
                  within the purpose, or leave as all contributors.
                </p>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="share-expiry">Link expires</Label>
              <select
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                id="share-expiry"
                value={expiryPreset}
                onChange={(event) =>
                  setExpiryPreset(event.target.value as ShareExpiryPreset)
                }
              >
                {shareExpiryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
              {isInviting
                ? "Processing…"
                : shareMethod === "link"
                  ? "Generate Link"
                  : "Send Invite"}
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
          <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border bg-muted/40 px-3 py-2.5">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <p
              className="min-w-0 flex-1 truncate font-mono text-xs"
              title={createdLink?.url}
            >
              {createdLink?.url}
            </p>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void handleCopyLink()}
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