"use client";
import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
}

export default function MarkdownViewer({ content }: Props) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "rgba(8,8,8,0.9)",
      fontSize: 12,
      lineHeight: 1.7,
      color: "#aaa",
      maxHeight: 400,
      overflowY: "auto",
    }}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0", marginBottom: 8, marginTop: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 6 }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, marginTop: 12, color: "#e85d27" }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 4, marginTop: 10 }}>
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p style={{ margin: "0 0 8px 0", color: "#999" }}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: "0 0 8px 0", paddingLeft: 16 }}>{children}</ul>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: 3, color: "#999" }}>{children}</li>
          ),
          code: ({ children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => (
            props.inline
              ? <code style={{ background: "rgba(232,93,39,0.1)", color: "#e85d27", padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}>{children}</code>
              : <code style={{ display: "block", background: "rgba(0,0,0,0.4)", padding: "8px 10px", borderRadius: 6, fontFamily: "monospace", fontSize: 11, color: "#ccc", margin: "6px 0", overflowX: "auto" }}>{children}</code>
          ),
          strong: ({ children }) => (
            <strong style={{ color: "#f0f0f0", fontWeight: 600 }}>{children}</strong>
          ),
          hr: () => (
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "10px 0" }} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
