import { Agent } from "@/lib/agents";

interface Props {
  activeView: "mission" | "swarms" | "analytics";
  onViewChange: (view: "mission" | "swarms" | "analytics") => void;
}

export default function NavRail({ activeView, onViewChange }: Props) {
  const navBtn = (active: boolean) =>
    `relative flex items-center justify-center w-full h-10 transition-colors ${
      active
        ? "text-[#e85d27] bg-[#1a0f0a]"
        : "text-gray-500 hover:text-gray-200 hover:bg-[#1a1a1a]"
    }`;

  return (
    <aside className="mc-rail w-[60px] flex flex-col items-center py-4 border-r border-[#222] bg-[#0e0e0e]">
      <div className="mb-8 cursor-pointer flex items-center justify-center w-full h-10" onClick={() => onViewChange("mission")}>
        <div className="text-2xl text-[#e85d27]">◈</div>
      </div>

      <nav className="flex flex-col gap-1 flex-1 w-full">
        <button className={navBtn(activeView === "mission")} onClick={() => onViewChange("mission")} title="Mission Canvas">
          {activeView === "mission" && <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-[#e85d27] rounded-r-full" />}
          <span className="text-xl">🎯</span>
        </button>
        <a
          href="/teams"
          className={`relative flex items-center justify-center w-full h-10 transition-colors text-gray-500 hover:text-gray-200 hover:bg-[#1a1a1a]`}
          title="Agentic Teams"
        >
          <span className="text-xl">🐝</span>
        </a>
        <button className={navBtn(activeView === "analytics")} onClick={() => onViewChange("analytics")} title="Analytics">
          {activeView === "analytics" && <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-[#e85d27] rounded-r-full" />}
          <span className="text-xl">📊</span>
        </button>
      </nav>

      <div className="mt-auto w-full">
        <button className="flex items-center justify-center w-full h-10 text-gray-500 hover:text-gray-200 hover:bg-[#1a1a1a] transition-colors" title="Settings">
          ⚙
        </button>
      </div>
    </aside>
  );
}
