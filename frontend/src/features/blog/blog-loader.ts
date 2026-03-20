export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  description: string;
  image: string;
  content: string;
}

// Simple frontmatter parser — no Node.js dependencies (gray-matter uses Buffer)
function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, content: raw };

  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim().replace(/^["']|["']$/g, '');
    data[key] = val;
  }

  return { data, content: match[2] };
}

// Import all .md files from content/blog at build time
const modules = import.meta.glob('/content/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function parsePosts(): BlogPost[] {
  const posts: BlogPost[] = [];

  for (const [path, raw] of Object.entries(modules)) {
    const { data, content } = parseFrontmatter(raw as string);
    const slug =
      data.slug ??
      path
        .split('/')
        .pop()
        ?.replace(/\.md$/, '') ??
      '';

    posts.push({
      slug,
      title: data.title ?? '',
      date: data.date ?? '',
      description: data.description ?? '',
      image: data.image ?? '',
      content,
    });
  }

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export const blogPosts: BlogPost[] = parsePosts();

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
