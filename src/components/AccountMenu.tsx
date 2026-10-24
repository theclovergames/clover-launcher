import { ChevronDown, PenLine, UserPlus, X } from "lucide-react";
import { useState } from "react";

import coinsIcon from "@/assets/icons/coins.png";
import { linkTone, SITE_LINKS } from "@/components/HomeExtras";
import { PlayerHead } from "@/components/PlayerHead";
import { pixel } from "@/components/PlayerStats";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { secondaryButton } from "@/lib/buttons";
import { formatCoins } from "@/lib/shop";
import { cn } from "@/lib/utils";
import type { Account } from "@/screens/SettingsScreen";
import type { Profile } from "@/types";

type Props = {
  /** Compte actif, affiché sur le bouton. */
  profile: Profile;
  /** Solde du compte actif ; `null` pendant la lecture ou si l'économie est indisponible. */
  coins: number | null;
  skin: string | null;
  accounts: Account[];
  onUse: (uuid: string) => void;
  onRemove: (uuid: string) => void;
  onAdd: () => void;
  /** Change le pseudo Minecraft du compte actif. */
  onRename: () => void;
  /** Vote, Discord et site, dans le navigateur. */
  onOpenLink: (url: string) => void;
  /** Ouvert d'office (planche des maquettes). */
  defaultOpen?: boolean;
};

const row = "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold";
const item = `${row} transition-colors hover:bg-secondary`;

/** Retire un compte du launcher ; partagé avec Paramètres › Générales. */
export function RemoveAccountButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Retirer ${name}`}
      title="Retirer ce compte"
      className={cn(secondaryButton, "size-8 shrink-0 px-0 text-muted-foreground [--mc-radius:5px] hover:text-destructive")}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}

/** Bascule entre comptes en un clic depuis la barre de titre, et mène au vote, au Discord et au site. */
export function AccountMenu({ profile, coins, skin, accounts, onUse, onRemove, onAdd, onRename, onOpenLink, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Comptes"
          className={cn(secondaryButton, "h-11 py-1 pr-2.5 pl-1.5 data-[state=open]:text-accent")}
        >
          <PlayerHead skin={skin} size={24} />
          <span className="flex flex-col items-start gap-0.5 text-left leading-none">
            <span>{profile.name}</span>
            <span className="flex items-center gap-1" title={coins === null ? "Solde de pièces indisponible" : formatCoins(coins)}>
              <img src={coinsIcon} alt="" width={16} height={16} className="pixelated shrink-0" />
              <span className="mc-text-shadow font-pixel text-[11px] leading-none text-accent" aria-hidden>{coins === null ? "—" : pixel(coins)}</span>
              <span className="sr-only">{coins === null ? "Solde de pièces indisponible" : formatCoins(coins)}</span>
            </span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        // Focus sur le menu, pas sur son premier bouton : Entrée retirerait le compte actif.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
        className="mc-frame w-[290px] gap-0 border-[var(--mc-outline)] bg-card p-0 ring-0 outline-none"
      >
        <ul className="flex flex-col p-1.5">
          {accounts.map((account) => (
            <li key={account.profile.uuid} className="flex items-center gap-1">
              {account.active ? (
                <div className={`${row} min-w-0 flex-1`}>
                  <PlayerHead skin={account.skin} size={28} />
                  <span className="flex-1 truncate">{account.profile.name}</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">Compte actif</span>
                </div>
              ) : (
                <button type="button" onClick={run(() => onUse(account.profile.uuid))} className={`${item} min-w-0 flex-1`}>
                  <PlayerHead skin={account.skin} size={28} />
                  <span className="flex-1 truncate">{account.profile.name}</span>
                </button>
              )}
              <RemoveAccountButton name={account.profile.name} onClick={() => onRemove(account.profile.uuid)} />
            </li>
          ))}
        </ul>

        <div className="flex flex-col border-t border-border p-1.5">
          <button type="button" onClick={run(onRename)} className={`${item} text-muted-foreground hover:text-foreground`}>
            <PenLine className="size-4" aria-hidden />
            Changer de pseudo
          </button>
          <button type="button" onClick={run(onAdd)} className={`${item} text-muted-foreground hover:text-foreground`}>
            <UserPlus className="size-4" aria-hidden />
            Ajouter un compte
          </button>
        </div>

        <nav aria-label="Clover Games" className="flex flex-col border-t border-border p-1.5">
          {SITE_LINKS.map(({ id, label, hint, url, Icon }) => (
            <button key={id} type="button" title={hint} onClick={run(() => onOpenLink(url))} className={item}>
              <Icon className={cn("size-4", linkTone(id))} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
