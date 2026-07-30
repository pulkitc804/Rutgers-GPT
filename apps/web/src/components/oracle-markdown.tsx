import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
};

/**
 * Renders Oracle assistant text as Markdown (lists, ### headings, bold, and GFM tables —
 * used for the weekly schedule grid and major-requirement tables). Links open in a new tab;
 * no raw HTML from models is executed.
 */
export function OracleMarkdown({ content }: Props) {
  if (!content.trim()) return null;

  return (
    <div className="oracle-md text-[15px] leading-[1.65] text-zinc-100 [&_a]:text-[#ffb3c7] [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-md [&_code]:bg-zinc-950/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-zinc-300 [&_h3]:first:mt-0 [&_li]:marker:text-zinc-500 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-3 [&_p]:last:mb-0 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/[0.08] [&_pre]:bg-zinc-950/80 [&_pre]:p-3 [&_pre]:text-[13px] [&_strong]:font-semibold [&_strong]:text-white [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/[0.1] ring-1 ring-black/20">
              <table className="w-full border-collapse text-[13.5px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#cc0033]/15">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-white/[0.1] px-3 py-2 text-left font-semibold text-white">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-white/[0.06] px-3 py-2 align-top text-zinc-200">{children}</td>
          ),
          tr: ({ children }) => <tr className="even:bg-white/[0.02]">{children}</tr>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
