import { source } from "@/lib/source";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
  };
}

export function generateStaticParams() {
  return source.generateParams();
}
