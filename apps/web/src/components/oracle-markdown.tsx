import ReactMarkdown from "react-markdown";

type Props = {
  content: string;
};

/**
 * Renders Oracle assistant text as Markdown (lists, ### headings, bold).
 * Links open in a new tab; no raw HTML from models is executed.
 */
export function OracleMarkdown({ content }: Props) {
  if (!content.trim()) return null;

  return (
    <div className="oracle-md text-[15px] leading-[1.65] text-zinc-100 [&_a]:text-[#ffb3c7] [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-md [&_code]:bg-zinc-950/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-zinc-300 [&_h3]:first:mt-0 [&_li]:marker:text-zinc-500 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-3 [&_p]:last:mb-0 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/[0.08] [&_pre]:bg-zinc-950/80 [&_pre]:p-3 [&_pre]:text-[13px] [&_strong]:font-semibold [&_strong]:text-white [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
