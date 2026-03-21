import { useEffect, useState } from "react";
import Markdown from "react-markdown";

export default function SwarmStage() {
  const [markdown, setMarkdown] = useState<string>("Loading Swarms Showcase...");

  useEffect(() => {
    // We fetch a designated markdown file, or just use a static content if not available yet.
    // The requirement says: Fetch the designated markdown file.
    // Let's try to fetch from an API or just set a demo content.
    fetch("/api/swarms/showcase")
      .then(res => res.ok ? res.text() : "# Swarms Showcase\n\nWelcome to the Swarms Showcase. Here you will find information about active swarms and their coordination.")
      .then(text => setMarkdown(text))
      .catch(() => setMarkdown("# Swarms Showcase\n\nWelcome to the Swarms Showcase."));
  }, []);

  return (
    <div className="mc-stage" style={{ flex: 1, backgroundColor: 'var(--mc-bg-stage, #0a0a0a)', color: '#f0f0f0' }}>
      <div className="h-full overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-4xl mx-auto prose prose-invert">
          <Markdown>{markdown}</Markdown>
        </div>
      </div>
    </div>
  );
}
