import { Link } from 'react-router';
import { ArrowRight, Calendar } from 'lucide-react';
import { Seo } from '@/shared/components/Seo';
import { Card, CardContent } from '@/shared/ui/card';
import { blogPosts } from '../blog-loader';

export function BlogListPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Seo
        title="Blog"
        description="Tips, guides, and insights on car wash management, online booking, and growing your auto detailing business."
        path="/blog"
      />

      <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Blog
      </h1>
      <p className="mb-10 text-lg text-muted-foreground">
        Tips and insights for car wash owners
      </p>

      <div className="space-y-4">
        {blogPosts.map((post) => (
          <Link key={post.slug} to={`/blog/${post.slug}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="p-6">
                <h2 className="mb-2 text-xl font-bold">{post.title}</h2>
                <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                  {post.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(post.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                  <span className="flex items-center gap-1 text-sm font-medium text-primary">
                    Read more <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
