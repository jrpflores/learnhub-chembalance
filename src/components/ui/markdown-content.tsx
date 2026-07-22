import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type MarkdownContentProps = {
  content: string;
  className?: string;
};

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const isVideoLink = (value?: string) => {
    if (!value) {
      return false;
    }
    return /\.(mp4|webm|mov)$/i.test(value);
  };

  return (
    <article className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img(props) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...props}
                alt={props.alt ?? "lesson image"}
                className="my-3 max-h-[320px] w-full rounded-xl border border-[var(--line-200)] object-contain bg-white"
              />
            );
          },
          a(props) {
            const href = typeof props.href === "string" ? props.href : undefined;
            if (isVideoLink(href)) {
              return (
                <video
                  className="my-3 w-full rounded-xl border border-[var(--line-200)] bg-black"
                  src={href}
                  controls
                  preload="metadata"
                />
              );
            }
            return (
              <a {...props} className="font-semibold text-[var(--brand-700)] underline underline-offset-2" />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
