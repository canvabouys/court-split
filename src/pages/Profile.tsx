import { useEffect, useState } from "react";
import { BadgeIndianRupee, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import { timeAgo } from "@/lib/format";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export default function Profile() {
  const { user, refresh } = useAuth();
  const { isAdmin } = useAccess();
  const [name, setName] = useState(user?.name ?? "");
  const [upiId, setUpiId] = useState(user?.upiId ?? "");

  useEffect(() => {
    setName(user?.name ?? "");
    setUpiId(user?.upiId ?? "");
  }, [user]);

  const update = trpc.users.updateProfile.useMutation({
    onSuccess: async () => {
      toast.success("Profile saved");
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!user) return <Skeleton className="h-72 rounded-xl" />;

  const dirty = name.trim() !== (user.name ?? "") || upiId.trim() !== (user.upiId ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How teammates see you, and where they can pay you.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar name={user.name} src={user.avatar} seed={user.id} className="h-16 w-16 text-lg" />
            <div>
              <p className="text-lg font-bold">{user.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Playing since {timeAgo(new Date(user.createdAt))}
              </p>
            </div>
          </div>

          {isAdmin ? (
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5 block">Display name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </div>
              <div>
                <Label className="mb-1.5 flex items-center gap-1.5">
                  <BadgeIndianRupee className="h-3.5 w-3.5" /> UPI ID
                </Label>
                <Input
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="yourname@okhdfcbank"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Teammates see a QR code for this UPI ID when they tap “Pay now”.
                </p>
              </div>
              <Button
                size="sm"
                disabled={!dirty || update.isPending}
                onClick={() =>
                  update.mutate({
                    name: name.trim() || undefined,
                    upiId: upiId.trim() === "" ? null : upiId.trim(),
                  })
                }
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <Eye className="h-4 w-4" /> Read-only — only the admin can edit details.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Display name
                  </p>
                  <p className="text-sm font-medium">{user.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">UPI ID</p>
                  <p className="text-sm font-medium">{user.upiId ?? "Not set"}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
