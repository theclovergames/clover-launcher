import { MessageCircle } from "lucide-react";

import { headUrl } from "@/lib/friends";

/**
 * Nouveau message ou demande d'ami, launcher au premier plan : la tête de l'ami, qui écrit et
 * l'aperçu ; un clic ouvre la conversation (ou les demandes). Fenêtre en arrière-plan, c'est une
 * bulle du système qui prévient.
 */
export function MessageToast({ name, title, text, onOpen, onDismiss }: { name: string; title: string; text: string; onOpen: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="mc-frame flex w-[340px] items-center gap-3 bg-card py-2.5 pr-3 pl-3 text-[13px] shadow-[0_12px_32px_rgb(0_0_0/0.5)]">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="relative shrink-0">
          <img src={headUrl(name)} alt="" width={36} height={36} draggable={false} className="pixelated size-9 rounded-[4px]" />
          <MessageCircle aria-hidden className="absolute -right-1.5 -bottom-1.5 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-semibold">{title}</span>
          {text && <span className="truncate text-xs text-muted-foreground">{text}</span>}
        </span>
      </button>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">
        Fermer
      </button>
    </div>
  );
}
