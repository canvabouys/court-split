import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, HandCoins } from "lucide-react";
import { formatINR, paiseToRupees } from "@contracts/money";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";

export interface PayTarget {
  userId: number;
  name: string;
  avatar?: string | null;
  upiId?: string | null;
  amountPaise: number;
}

export function PayDialog({
  target,
  onClose,
}: {
  target: PayTarget | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { user: me } = useAuth();
  const [qr, setQr] = useState<string | null>(null);

  const upiLink = target?.upiId
    ? `upi://pay?pa=${encodeURIComponent(target.upiId)}&pn=${encodeURIComponent(
        target.name,
      )}&am=${paiseToRupees(target.amountPaise).toFixed(2)}&cu=INR&tn=${encodeURIComponent(
        "CourtSplit settlement",
      )}`
    : null;

  useEffect(() => {
    setQr(null);
    if (upiLink) {
      QRCode.toDataURL(upiLink, { margin: 1, width: 220 })
        .then(setQr)
        .catch(() => setQr(null));
    }
  }, [upiLink]);

  const pay = trpc.payments.create.useMutation({
    onSuccess: async () => {
      toast.success("Payment recorded", {
        description: `${target?.name} will be asked to confirm.`,
      });
      await utils.payments.overview.invalidate();
      await utils.dashboard.summary.invalidate();
      await utils.payments.settlement.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const settle = trpc.payments.recordSettled.useMutation({
    onSuccess: async () => {
      toast.success("Marked as settled");
      await utils.payments.overview.invalidate();
      await utils.dashboard.summary.invalidate();
      await utils.payments.settlement.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!target) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pay {target.name.split(" ")[0]}</DialogTitle>
          <DialogDescription>
            Settle {formatINR(target.amountPaise)} via UPI or in person.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex items-center gap-3">
            <UserAvatar name={target.name} src={target.avatar} seed={target.userId} className="h-10 w-10" />
            <div>
              <p className="text-sm font-semibold">{target.name}</p>
              <p className="text-2xl font-bold tabular">{formatINR(target.amountPaise)}</p>
            </div>
          </div>

          {qr ? (
            <div className="rounded-xl border bg-white p-3">
              <img src={qr} alt="UPI QR code" className="h-48 w-48" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {target.name.split(" ")[0]} hasn't added a UPI ID yet — settle in person and record
              it here.
            </div>
          )}

          {upiLink && (
            <Button asChild className="w-full gap-2">
              <a href={upiLink}>
                <ExternalLink className="h-4 w-4" />
                Open UPI app to pay
              </a>
            </Button>
          )}

          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={pay.isPending}
              onClick={() =>
                pay.mutate({
                  toUserId: target.userId,
                  amountPaise: target.amountPaise,
                  method: "upi",
                })
              }
            >
              <CheckCircle2 className="h-4 w-4" />
              I've paid
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={settle.isPending || !me}
              onClick={() =>
                me &&
                settle.mutate({
                  fromUserId: me.id,
                  toUserId: target.userId,
                  amountPaise: target.amountPaise,
                  note: "Settled with cash",
                })
              }
            >
              <HandCoins className="h-4 w-4" />
              Paid in cash
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
