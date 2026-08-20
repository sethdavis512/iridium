import ReactMarkdown from 'react-markdown';

export function Markdown({ children }: { children: string }) {
    return (
        <ReactMarkdown
            components={{
                p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                    <ul className="mb-2 list-disc pl-4">{children}</ul>
                ),
                ol: ({ children }) => (
                    <ol className="mb-2 list-decimal pl-4">{children}</ol>
                ),
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                h1: ({ children }) => (
                    <h1 className="mb-2 text-lg font-bold">{children}</h1>
                ),
                h2: ({ children }) => (
                    <h2 className="mb-2 text-base font-bold">{children}</h2>
                ),
                h3: ({ children }) => (
                    <h3 className="mb-1 text-sm font-bold">{children}</h3>
                ),
                code: ({ children }) => (
                    <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs">
                        {children}
                    </code>
                ),
                a: ({ children, href, ...props }) => {
                    const isSafe = href && /^https?:\/\//i.test(href);

                    return isSafe ? (
                        <a
                            className="underline underline-offset-4"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            {...props}
                        >
                            {children}
                        </a>
                    ) : (
                        <span>{children}</span>
                    );
                },
                hr: () => <hr className="border-border my-4" />,
            }}
        >
            {children}
        </ReactMarkdown>
    );
}
