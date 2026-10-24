import {
  ArrowUpRight,
  Bolt,
  Box,
  Check,
  Coins,
  CreditCard,
  Crown,
  Flame,
  Gem,
  Gift,
  Heart,
  Layers,
  LoaderCircle,
  Lock,
  type LucideIcon,
  Megaphone,
  Package,
  Rocket,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Sword,
  Tag,
  Target,
  Trophy,
  User,
  X,
  Zap,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/PlayerStats";
import { Tabs } from "@/components/Tabs";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { headUrl } from "@/lib/friends";
import { shortWhen } from "@/lib/messages";
import type { OpenProduct } from "@/lib/routes";
import { openLink, safeHtml } from "@/lib/safe-html";
import { bySection, comparison, featuredProduct, formatCoins, formatEuros, goalPercent, isGiftName, kindLabel, priceLabel } from "@/lib/shop";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";
import { type Confirmation, ConfirmDialog } from "@/screens/Dialogs";
import type { ShopAccount, ShopBadge, ShopCatalog, ShopCategory, ShopFeature, ShopProduct } from "@/types";

/** Icônes proposées pour une catégorie par l'administration du site (`shop-ui.ts`), par leur nom. */
const ICONS: Record<string, LucideIcon> = { Bolt, Box, Crown, Flame, Gem, Gift, Heart, Layers, Package, Rocket, Shield, Sparkles, Star, Sword, Tag, Trophy, Zap };

/** Couleurs des catégories du site, par clé. */
const COLORS: Record<string, string> = {
  yellow: "#eab308",
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  pink: "#ec4899",
  orange: "#f97316",
  gray: "#6b7280",
};

const BADGES: Record<ShopBadge, { label: string; color: string }> = {
  popular: { label: "Populaire", color: "#f59e0b" },
  "best-offer": { label: "Best-seller", color: "var(--primary)" },
  new: { label: "Nouveau", color: "#3b82f6" },
  sale: { label: "Promo", color: "#ef4444" },
};

type Services = Pick<typeof api, "shopCatalog" | "shopProduct" | "shopCheckout" | "shopPayCredits">;

type Props = {
  /** Même solde et mêmes restrictions que dans la barre du compte. */
  account: ShopAccount | null;
  accountError: string | null;
  onRefreshAccount: () => void;
  /** Slug de la catégorie ouverte ; la première sinon. */
  category?: string;
  /** Fiche ouverte. */
  product?: OpenProduct;
  onCategory: (slug: string) => void;
  onOpenProduct: (product: OpenProduct) => void;
  onOpenPlayer: (name: string) => void;
  onOpenLink: (url: string) => void;
  onNotice: (message: string) => void;
  services?: Services;
};

const colorOf = (category: ShopCategory | undefined) => (category?.color && COLORS[category.color]) || "var(--primary)";
const iconOf = (category: ShopCategory | undefined) => (category?.icon && ICONS[category.icon]) || Package;

/** Payable en pièces : prix en pièces et paiement en pièces ouvert sur le site. */
const coinsOf = (product: ShopProduct, catalog: ShopCatalog) => (catalog.credits?.enabled && product.credits !== null ? product.credits : null);

function BadgeTag({ badge, className }: { badge: ShopBadge; className?: string }) {
  const { label, color } = BADGES[badge];
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase", className)} style={{ color, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }}>
      {label}
    </span>
  );
}

/** Image du produit, ou l'icône de sa catégorie, sur un fond de sa couleur. */
function ProductArt({ product, category, className, iconClass }: { product: ShopProduct; category: ShopCategory | undefined; className?: string; iconClass?: string }) {
  const color = colorOf(category);
  const Icon = iconOf(category);
  return (
    <div className={cn("relative grid place-items-center overflow-hidden", className)} style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 22%, transparent), transparent 75%)` }}>
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" loading="lazy" draggable={false} className="max-h-[78%] max-w-[78%] object-contain drop-shadow-[0_8px_18px_rgb(0_0_0/0.45)]" />
      ) : (
        <Icon className={cn("size-12", iconClass)} style={{ color }} aria-hidden />
      )}
    </div>
  );
}

/** Prix principal (euros, sinon pièces) et l'autre moyen de paiement. */
function Price({ product, catalog, large }: { product: ShopProduct; catalog: ShopCatalog; large?: boolean }) {
  const coins = coinsOf(product, catalog);
  const main = product.euro ? priceLabel(product) : coins !== null ? formatCoins(coins) : priceLabel(product);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cn("font-display leading-none tabular-nums", large ? "text-[30px]" : "text-lg")}>{main}</span>
      {product.euro && coins !== null && <span className="text-xs text-muted-foreground tabular-nums">ou {formatCoins(coins)}</span>}
    </div>
  );
}

function ProductCard({ product, catalog, blocked, onOpen }: { product: ShopProduct; catalog: ShopCatalog; blocked: string | undefined; onOpen: () => void }) {
  const category = catalog.categories.find((entry) => entry.slug === product.category);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-[border-color,transform] hover:border-white/20 motion-safe:hover:-translate-y-0.5"
    >
      <div className="relative">
        <ProductArt product={product} category={category} className="h-36" />
        {product.badge && <BadgeTag badge={product.badge} className="absolute top-2 left-2" />}
        {blocked && (
          <span title={blocked} className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white/85">
            <Lock className="size-3" aria-hidden />
            {blocked.length > 26 ? "Indisponible" : blocked}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="truncate font-bold">{product.name}</p>
        {product.description && <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{product.description}</p>}
        <div className="mt-auto pt-2">
          <Price product={product} catalog={catalog} />
        </div>
      </div>
    </button>
  );
}

/** Le produit mis en avant, en grand, comme en tête de la boutique du site. */
function Featured({ product, catalog, onOpen }: { product: ShopProduct; catalog: ShopCatalog; onOpen: () => void }) {
  const category = catalog.categories.find((entry) => entry.slug === product.category);
  return (
    <button type="button" onClick={onOpen} className="group grid min-h-44 grid-cols-[minmax(0,1fr)_220px] overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-white/20">
      <div className="flex min-w-0 flex-col justify-center gap-2 px-6 py-5">
        <span className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
          <Sparkles className="size-3.5 text-accent" aria-hidden />À la une
          {product.badge && <BadgeTag badge={product.badge} />}
        </span>
        <p className="font-display text-[28px] leading-none">{product.name}</p>
        {product.description && <p className="line-clamp-2 max-w-xl text-sm text-muted-foreground">{product.description}</p>}
        <div className="mt-1 flex items-center gap-4">
          <Price product={product} catalog={catalog} />
          <span className="flex items-center gap-1 text-xs font-semibold text-primary group-hover:underline">
            Voir le produit
            <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
        </div>
      </div>
      <ProductArt product={product} category={category} iconClass="size-20" />
    </button>
  );
}

function FeatureValue({ value }: { value: ShopFeature["value"] | null }) {
  if (value === true) return <Check className="mx-auto size-4 text-primary" aria-label="Inclus" />;
  if (value === false || value === null) return <X className="mx-auto size-4 text-muted-foreground/50" aria-label="Non inclus" />;
  return <span className="font-semibold">{value}</span>;
}

function Comparison({ products, catalog, onOpen }: { products: ShopProduct[]; catalog: ShopCatalog; onOpen: (product: ShopProduct) => void }) {
  const table = comparison(products);
  if (!table) return null;
  return (
    <section aria-label="Comparer" className="flex flex-col gap-3">
      <h2 className="font-display text-xl leading-none">Comparer</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-sunken">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                Avantage
              </th>
              {table.products.map((product) => (
                <th key={product.id} scope="col" className={cn("px-3 py-2.5 text-center", product.badge === "popular" && "bg-primary/[0.08]")}>
                  <button type="button" onClick={() => onOpen(product)} className="flex w-full flex-col items-center gap-0.5 hover:underline">
                    <span className="font-bold">{product.name}</span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">{product.euro ? priceLabel(product) : formatCoins(coinsOf(product, catalog) ?? 0)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-semibold">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={table.products[index].id} className={cn("px-3 py-2 text-center", table.products[index].badge === "popular" && "bg-primary/[0.08]")}>
                    <FeatureValue value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Panel({ title, Icon, children }: { title: string; Icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Objectif du mois, meilleur soutien et derniers achats, comme dans la colonne de la boutique du site. */
function Community({ catalog, onOpenPlayer }: { catalog: ShopCatalog; onOpenPlayer: (name: string) => void }) {
  const { goal, topBuyer, recent } = catalog;
  const now = Date.now();
  return (
    <>
      {goal && (
        <Panel title="Objectif du mois" Icon={Target}>
          <p className="text-sm font-semibold">{goal.label}</p>
          <div className="h-2.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalPercent(goal)} aria-label={goal.label}>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${goalPercent(goal)}%` }} />
          </div>
          <p className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{formatEuros(Math.round(goal.current * 100))}</span>
            <span>
              {goalPercent(goal)} % de {formatEuros(Math.round(goal.target * 100))}
            </span>
          </p>
        </Panel>
      )}
      {topBuyer && (
        <Panel title="Meilleur soutien du mois" Icon={Crown}>
          <button type="button" onClick={() => onOpenPlayer(topBuyer.name)} className="group flex items-center gap-3 text-left">
            <img src={headUrl(topBuyer.name)} alt="" width={36} height={36} draggable={false} className="pixelated size-9 rounded-[4px]" />
            <span className="font-bold group-hover:underline">{topBuyer.name}</span>
          </button>
        </Panel>
      )}
      {recent.length > 0 && (
        <Panel title="Derniers achats" Icon={Gift}>
          <ul className="flex flex-col gap-2.5">
            {recent.map((order, index) => {
              const at = Date.parse(order.at);
              return (
                <li key={`${order.name}-${order.at}-${index}`} className="flex items-center gap-2.5 text-[13px]">
                  <button type="button" onClick={() => onOpenPlayer(order.name)} title={`Voir le profil de ${order.name}`} className="shrink-0">
                    <img src={headUrl(order.name, 32)} alt="" width={28} height={28} loading="lazy" draggable={false} className="pixelated size-7 rounded-[4px]" />
                  </button>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-bold">{order.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{order.product}</span>
                  </span>
                  {Number.isFinite(at) && <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{shortWhen(at, now)}</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}

function Balance({ account, error }: { account: ShopAccount | null; error: string | null }) {
  const balance = account?.balance ?? null;
  return (
    <span
      title={error ?? (balance === null ? "Solde indisponible pour le moment" : "Tes pièces, gagnées en jeu")}
      className="flex h-9 items-center gap-2 rounded-md border border-border bg-sunken px-3 text-[13px] font-semibold tabular-nums"
    >
      <Coins className="size-4 text-accent" aria-hidden />
      {account === null && !error ? <Skeleton className="h-3.5 w-16" /> : balance === null ? "—" : formatCoins(balance)}
    </span>
  );
}

/** Achat d'un produit : pour soi ou en cadeau, en euros (Stripe, dans le navigateur) ou en pièces. */
function Purchase(props: { product: ShopProduct; catalog: ShopCatalog; account: ShopAccount | null; accountError: string | null; services: Services; onOpenLink: (url: string) => void; onNotice: (message: string) => void; onPaid: () => void }) {
  const { product, catalog, account, services } = props;
  const [target, setTarget] = useState<"me" | "gift">("me");
  const [gift, setGift] = useState("");
  const [busy, setBusy] = useState<"euro" | "coins" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const coins = coinsOf(product, catalog);
  const giftName = gift.trim();
  const forGift = target === "gift";
  const blocked = forGift ? undefined : account?.blocked[product.id];
  const recipientReady = !forGift || isGiftName(giftName);
  const balance = account?.balance ?? null;
  const missing = coins !== null && balance !== null && balance < coins ? coins - balance : 0;
  const ready = recipientReady && !blocked && busy === null;
  const recipient = forGift ? giftName : null;
  const whom = forGift ? `pour ${giftName}` : "pour toi";

  const payEuros = async () => {
    setBusy("euro");
    setError(null);
    try {
      const url = await services.shopCheckout(product.id, recipient);
      props.onOpenLink(url);
      props.onNotice("Paiement ouvert dans ton navigateur. L'achat arrive en jeu dès que Stripe le confirme.");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(null);
    }
  };

  const payCoins = async () => {
    if (coins === null) return;
    setBusy("coins");
    setError(null);
    try {
      const paid = await services.shopPayCredits(product.id, recipient);
      props.onNotice(`${paid.productName || product.name} acheté ${whom} : ${formatCoins(paid.credits)} dépensées${paid.remaining !== null ? `, il t'en reste ${formatCoins(paid.remaining).replace(/ pièces?$/, "")}` : ""}.`);
      props.onPaid();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(null);
    }
  };

  const askCoins = () =>
    coins !== null &&
    setConfirm({
      title: `Payer ${formatCoins(coins)} ?`,
      description: `${product.name} ${whom}. Les pièces sont retirées de ton solde du jeu et l'achat arrive aussitôt en jeu.`,
      detail: balance !== null ? `Solde après l'achat : ${formatCoins(balance - coins)}` : undefined,
      confirm: "Payer",
      pay: true,
      onConfirm: () => void payCoins(),
    });

  return (
    <section aria-label="Acheter" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{kindLabel(product)}</span>
        <Price product={product} catalog={catalog} large />
      </div>

      <Tabs
        label="Destinataire"
        value={target}
        onChange={(value) => {
          setTarget(value);
          setError(null);
        }}
        items={[
          { id: "me", label: "Pour moi", Icon: User },
          { id: "gift", label: "Offrir", Icon: Gift },
        ]}
      />
      {forGift && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Pseudo du joueur</span>
          <input
            value={gift}
            onChange={(event) => setGift(event.target.value)}
            maxLength={16}
            spellCheck={false}
            autoComplete="off"
            placeholder="Pseudo Minecraft"
            className="h-10 w-full rounded-md border border-border bg-sunken px-3 text-sm text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
          />
          {giftName && !isGiftName(giftName) && <span className="text-[11px] text-error">3 à 16 lettres, chiffres ou « _ ».</span>}
        </label>
      )}

      {blocked && (
        <p className="flex items-start gap-2 rounded-md border border-border bg-sunken px-3 py-2.5 text-[13px]">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {blocked}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {product.euro && (
          <button type="button" onClick={() => void payEuros()} disabled={!ready} className={cn(primaryButton, "h-10")}>
            {busy === "euro" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <CreditCard className="size-4" aria-hidden />}
            Payer {priceLabel(product)}
          </button>
        )}
        {coins !== null && (
          <button type="button" onClick={askCoins} disabled={!ready || missing > 0} className={cn(product.euro ? secondaryButton : primaryButton, "h-10")}>
            {busy === "coins" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Coins className="size-4" aria-hidden />}
            Payer {formatCoins(coins)}
          </button>
        )}
        {!product.euro && coins === null && <p className="text-[13px] text-muted-foreground">Ce produit ne s'achète pas depuis le launcher pour le moment.</p>}
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-3 text-[11px] leading-snug text-muted-foreground">
        {coins !== null && (
          <span className="tabular-nums">
            {props.accountError ? props.accountError : balance === null ? "Solde de pièces indisponible pour le moment." : `Ton solde : ${formatCoins(balance)}${missing > 0 ? ` · il te manque ${formatCoins(missing)}` : ""}`}
          </span>
        )}
        {product.euro && <span>Paiement par carte sécurisé par Stripe, dans ton navigateur : le launcher ne voit jamais ta carte.</span>}
      </div>
      <ConfirmDialog ask={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}

/** Fiche d'un produit : image, avantages, texte complet du site, et l'achat. */
function ProductPage(props: { open: OpenProduct; catalog: ShopCatalog; account: ShopAccount | null; accountError: string | null; services: Services; onOpenLink: (url: string) => void; onNotice: (message: string) => void; onPaid: () => void }) {
  const { open, catalog, services } = props;
  const summary = catalog.products.find((entry) => entry.id === open.id);
  const [detail, setDetail] = useState<ShopProduct | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    services
      .shopProduct(open.id)
      .then((product) => live && setDetail(product))
      .catch(() => live && setDetail(summary ?? null));
    return () => {
      live = false;
    };
  }, [open.id, services, summary]);
  const product = detail ?? summary;
  const html = useMemo(() => (detail?.content ? safeHtml(detail.content) : ""), [detail]);

  if (!product) {
    return detail === undefined ? (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[320px]" />
      </div>
    ) : (
      <EmptyState className="mt-6" title="Produit introuvable" hint="Il n'est plus en vente. Retourne à la boutique pour voir les autres." />
    );
  }

  const category = catalog.categories.find((entry) => entry.slug === product.category);
  const included = product.features.filter((feature) => feature.value !== false);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="relative">
          <ProductArt product={product} category={category} className="h-56 rounded-xl border border-border" iconClass="size-20" />
          {product.badge && <BadgeTag badge={product.badge} className="absolute top-3 left-3" />}
        </div>
        <header className="flex flex-col gap-2">
          {category && <span className="text-xs font-semibold text-muted-foreground">{category.name}</span>}
          <h1 className="font-display text-[34px] leading-none">{product.name}</h1>
          {product.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{product.description}</p>}
        </header>
        {included.length > 0 && (
          <section aria-label="Avantages" className="grid gap-x-6 gap-y-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
            {included.map((feature) => (
              <p key={feature.label} className="flex items-center gap-2 text-[13px]">
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  {feature.label}
                  {typeof feature.value === "string" && feature.value && <span className="font-semibold"> : {feature.value}</span>}
                </span>
              </p>
            ))}
          </section>
        )}
        {html && (
          <article
            className="prose prose-sm prose-invert max-w-none select-text prose-headings:font-display prose-headings:font-normal prose-a:text-primary prose-img:rounded-md"
            // Texte de l'éditeur du site, filtré par liste blanche (`safeHtml`).
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={(event) => openLink(event, props.onOpenLink)}
            onAuxClick={(event) => openLink(event, props.onOpenLink)}
          />
        )}
      </div>
      <div className="lg:sticky lg:top-0">
        <Purchase
          key={product.id}
          product={product}
          catalog={catalog}
          account={props.account}
          accountError={props.accountError}
          services={services}
          onOpenLink={props.onOpenLink}
          onNotice={props.onNotice}
          onPaid={props.onPaid}
        />
      </div>
    </div>
  );
}

/**
 * Boutique du serveur, la même que clovergames.fr/shop : produit à la une, catégories, cartes et
 * tableau comparatif, objectif du mois et derniers achats ; la fiche d'un produit permet de
 * l'acheter pour soi ou de l'offrir. Les euros se paient par Stripe dans le navigateur, les pièces
 * du jeu directement ici. Le solde, partagé avec la barre du compte, se relit après un achat et
 * quand la fenêtre revient au premier plan (après un paiement dans le navigateur).
 */
export function ShopScreen({ account, accountError, onRefreshAccount, category: categorySlug, product: open, onCategory, onOpenProduct, onOpenPlayer, onOpenLink, onNotice, services = api }: Props) {
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    services
      .shopCatalog()
      .then(setCatalog)
      .catch((reason) => setError(String(reason)));
  }, [services]);
  useEffect(load, [load]);

  if (error && !catalog) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-10">
        <EmptyState
          className="w-full max-w-lg"
          title="Boutique indisponible"
          hint={error}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={load} className={secondaryButton}>
                <RotateCcw className="size-4" aria-hidden />
                Réessayer
              </button>
              <button type="button" onClick={() => onOpenLink(`${SITE_URL}/shop`)} className={secondaryButton}>
                Ouvrir sur le site
                <ArrowUpRight className="size-4" aria-hidden />
              </button>
            </div>
          }
        />
      </main>
    );
  }

  const openProduct = (product: ShopProduct) => onOpenProduct({ id: product.id, name: product.name });

  if (open) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-7 pb-10">
        {catalog ? (
          <ProductPage
            key={open.id}
            open={open}
            catalog={catalog}
            account={account}
            accountError={accountError}
            services={services}
            onOpenLink={onOpenLink}
            onNotice={onNotice}
            onPaid={onRefreshAccount}
          />
        ) : (
          <Skeleton className="h-[420px]" />
        )}
      </main>
    );
  }

  const categories = catalog?.categories ?? [];
  const current = categories.find((entry) => entry.slug === categorySlug) ?? categories[0];
  const products = catalog && current ? catalog.products.filter((product) => product.category === current.slug) : [];
  const featured = catalog ? featuredProduct(catalog.products) : null;
  const showCommunity = catalog !== null && (catalog.goal !== null || catalog.topBuyer !== null || catalog.recent.length > 0);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-7 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[34px] leading-none">Boutique</h1>
          <p className="text-sm text-muted-foreground">Grades et avantages du serveur, les mêmes que sur clovergames.fr.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {catalog?.credits?.enabled && <Balance account={account} error={accountError} />}
          <button type="button" onClick={() => onOpenLink(`${SITE_URL}/shop`)} className={secondaryButton}>
            Voir sur le site
            <ArrowUpRight className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      {!catalog ? (
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-10 w-96" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-60" />
            <Skeleton className="h-60" />
            <Skeleton className="h-60" />
          </div>
        </div>
      ) : catalog.products.length === 0 || !current ? (
        <EmptyState className="mt-8" title="La boutique est vide pour le moment" hint="Les produits apparaîtront ici dès qu'ils seront en vente sur le site." />
      ) : (
        <>
          {catalog.banner && (
            <p className="mt-5 flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-[13px]">
              <Megaphone className="size-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">{catalog.banner.text}</span>
              {catalog.banner.url && (
                <button type="button" onClick={() => onOpenLink(catalog.banner!.url!)} className="flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline">
                  En savoir plus
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </button>
              )}
            </p>
          )}
          <div className={cn("mt-6 grid items-start gap-6", showCommunity && "xl:grid-cols-[minmax(0,1fr)_280px]")}>
            <div className="flex min-w-0 flex-col gap-6">
              {featured && <Featured product={featured} catalog={catalog} onOpen={() => openProduct(featured)} />}
              <div className="flex flex-col gap-2">
                <Tabs label="Catégories" value={current.slug} onChange={onCategory} items={categories.map((entry) => ({ id: entry.slug, label: entry.name, Icon: iconOf(entry) }))} />
                {current.description && <p className="text-[13px] text-muted-foreground">{current.description}</p>}
              </div>
              {products.length === 0 ? (
                <EmptyState title="Rien dans cette catégorie" hint="Choisis une autre catégorie." />
              ) : (
                bySection(products).map((group) => (
                  <section key={group.section ?? ""} aria-label={group.section ?? current.name} className="flex flex-col gap-3">
                    {group.section && <h2 className="font-display text-xl leading-none">{group.section}</h2>}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                      {group.products.map((product) => (
                        <ProductCard key={product.id} product={product} catalog={catalog} blocked={account?.blocked[product.id]} onOpen={() => openProduct(product)} />
                      ))}
                    </div>
                  </section>
                ))
              )}
              <Comparison products={products} catalog={catalog} onOpen={openProduct} />
            </div>
            {showCommunity && (
              <aside aria-label="Communauté" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <Community catalog={catalog} onOpenPlayer={onOpenPlayer} />
              </aside>
            )}
          </div>
        </>
      )}
    </main>
  );
}
