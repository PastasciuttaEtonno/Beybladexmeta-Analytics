import { useEffect } from "react";

type SeoProps = {
  title?: string;
  description?: string;
  canonical?: string;
  imageUrl?: string;
  type?: string;
  structuredData?: any;
};

function setMeta(name: string, content: string) {
  const el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (el) {
    el.content = content;
  } else {
    const m = document.createElement("meta");
    m.setAttribute("name", name);
    m.setAttribute("content", content);
    document.head.appendChild(m);
  }
}

function setProperty(property: string, content: string) {
  const el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (el) {
    el.content = content;
  } else {
    const m = document.createElement("meta");
    m.setAttribute("property", property);
    m.setAttribute("content", content);
    document.head.appendChild(m);
  }
}

function setCanonical(href: string) {
  const el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (el) {
    el.href = href;
  } else {
    const l = document.createElement("link");
    l.setAttribute("rel", "canonical");
    l.setAttribute("href", href);
    document.head.appendChild(l);
  }
}

function setJsonLd(data: any) {
  const existing = document.querySelector('script[type="application/ld+json"][data-page-seo="true"]') as HTMLScriptElement | null;
  const json = JSON.stringify(data);
  if (existing) {
    existing.textContent = json;
  } else {
    const s = document.createElement("script");
    s.setAttribute("type", "application/ld+json");
    s.setAttribute("data-page-seo", "true");
    s.textContent = json;
    document.head.appendChild(s);
  }
}

export function Seo({ title, description, canonical, imageUrl, type, structuredData }: SeoProps) {
  useEffect(() => {
    const origin = window.location.origin;
    const url = canonical || `${origin}${window.location.pathname}`;
    if (title) {
      document.title = title;
      setProperty("og:title", title);
      setMeta("twitter:title", title);
    }
    if (description) {
      setMeta("description", description);
      setProperty("og:description", description);
      setMeta("twitter:description", description);
    }
    setCanonical(url);
    setProperty("og:url", url);
    if (type) setProperty("og:type", type);
    const img = imageUrl || `${origin}/meta%20logo.svg`;
    setProperty("og:image", img);
    setMeta("twitter:image", img);
    if (structuredData) setJsonLd(structuredData);
  }, [title, description, canonical, imageUrl, type, structuredData]);
  return null;
}

