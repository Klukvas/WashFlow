import { useParams, Link, Navigate } from 'react-router';
import Markdown from 'react-markdown';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Seo } from '@/shared/components/Seo';
import { getPostBySlug } from '../blog-loader';

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Seo
        title={post.title}
        description={post.description}
        path={`/blog/${post.slug}`}
        image={post.image ? `https://washflow.com${post.image}` : undefined}
      />

      <Link
        to="/blog"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to blog
      </Link>

      <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
        {post.title}
      </h1>

      <div className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        {new Date(post.date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <Markdown
          components={{
            h2: ({ children }) => (
              <h2 className="mb-4 mt-10 text-2xl font-bold">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-3 mt-8 text-xl font-semibold">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="mb-4 text-muted-foreground leading-relaxed">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="mb-4 list-disc space-y-2 pl-6 text-muted-foreground">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-4 list-decimal space-y-2 pl-6 text-muted-foreground">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">
                {children}
              </strong>
            ),
            a: ({ href, children }) => (
              <Link
                to={href ?? '/'}
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {children}
              </Link>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-6 border-l-4 border-primary/30 pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            ),
          }}
        >
          {post.content}
        </Markdown>
      </div>

      <div className="mt-12 border-t border-border pt-8">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          All articles
        </Link>
      </div>
    </article>
  );
}
