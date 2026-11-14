import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Page } from "@/components/Page";
import { api } from "@/lib/api";
import { secondaryButton } from "@/lib/buttons";
import { changelogLabel, readerTitle, type ReaderTarget } from "@/lib/news";
import { openLink, safeHtml } from "@/lib/safe-html";

type Services = Pick<typeof api, "blogArticle" | "changelogArticle" | "minecraftArticle">;
type Loaded = { html: string; title: string; image: string | null; author: string | null };

const KIND_LABELS: Record<string, string> = { release: "Nouvelle version", snapshot: "Snapshot", news: "Annonce" };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const keyOf = (target: ReaderTarget) => target.source === "clover" ? `clover:${target.slug}` : target.source === "changelog" ? `changelog:${target.item.slug}` : `minecraft:${target.item.id}`;

/**
 * Page d'un article (sous-page des Actualités), lu sans ouvrir le site : HTML préparé par le site,
 * filtré une seconde fois ici. Les liens s'ouvrent dans le navigateur, jamais dans la fenêtre du launcher.
 */
export function ArticleScreen({ target, onOpenLink, services = api }: { target: ReaderTarget; onOpenLink: (url: string) => void; services?: Services }) {
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded | null; error: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const key = keyOf(target);
    const request: Promise<Loaded> =
      target.source === "minecraft"
        ? services.minecraftArticle(target.item.id).then((article) => ({ html: article.html, title: article.title, image: null, author: null }))
        : (target.source === "clover" ? services.blogArticle(target.slug) : services.changelogArticle(target.item.slug))
          .then((article) => ({ html: article.html, title: article.title, image: article.image, author: article.author }));
    request.then((value) => alive && setLoaded({ key, value, error: null })).catch((reason) => alive && setLoaded({ key, value: null, error: String(reason) }));
    return () => {
      alive = false;
    };
  }, [target, services]);

  const current = loaded?.key === keyOf(target) ? loaded : null;
  const html = useMemo(() => (current?.value ? safeHtml(current.value.html) : ""), [current]);
  const label = target.source === "clover" ? (target.category ?? "Clover Games") : target.source === "changelog" ? `Changelog · ${changelogLabel(target.item)}` : (KIND_LABELS[target.item.kind] ?? "Annonce");
  const date = dateFormat.format(new Date(target.source === "clover" ? target.publishedAt : target.item.publishedAt));
  const author = current?.value?.author;

  return (
    <Page
      title={current?.value?.title ?? readerTitle(target)}
      subtitle={`${label} · ${date}${author ? ` · par ${author}` : ""}`}
      actions={
        target.source !== "minecraft" && (
          <button type="button" onClick={() => onOpenLink(target.source === "clover" ? target.url : target.item.url)} className={secondaryButton}>
            Voir sur le site
            <ArrowUpRight className="size-4" aria-hidden />
          </button>
        )
      }
    >
      {!current ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {target.source === "minecraft" ? "Chargement de la note de version…" : target.source === "changelog" ? "Chargement du changelog…" : "Chargement de l'article…"}
        </p>
      ) : current.error ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">{current.error}</p>
      ) : (
        <div className="mt-6 flex w-full max-w-[860px] flex-col gap-6">
          {current.value?.image && <img src={current.value.image} alt="" className="mc-frame aspect-[16/6] w-full object-cover" />}
          <article
            className="prose prose-invert max-w-none select-text prose-headings:font-display prose-headings:font-normal prose-a:text-primary prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-img:rounded-md"
            onClick={(event) => openLink(event, onOpenLink)}
            onAuxClick={(event) => openLink(event, onOpenLink)}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </Page>
  );
}
