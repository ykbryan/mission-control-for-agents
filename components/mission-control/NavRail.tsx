import { Agent } from "@/lib/agents";

interface Props {
  activeView: "mission" | "swarms" | "analytics";
  onViewChange: (view: "mission" | "swarms" | "analytics") => void;
}

export default function NavRail({ activeView, onViewChange }: Props) {
  return (
    <aside className="mc-rail w-[60px] flex flex-col items-center py-4 border-r border-[#333] bg-[#111]">
      <div className="mc-rail__brand mb-8 cursor-pointer" onClick={() => onViewChange("mission")}>
        <div className="text-2xl text-[#e85d27]">◈</div>
      </div>

      <nav className="flex flex-col gap-6 flex-1">
        <button
          className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
            activeView === "mission" ? "bg-[#e85d27] text-white" : "text-gray-400 hover:text-white hover:bg-[#222]"
          }`}
          onClick={() => onViewChange("mission")}
          title="Mission Canvas"
        >
          <span className="text-xl">🎯</span>
        </button>
        <button
          className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
            activeView === "swarms" ? "bg-[#e85d27] text-white" : "text-gray-400 hover:text-white hover:bg-[#222]"
          }`}
          onClick={() => onViewChange("swarms")}
          title="Swarms Showcase"
        >
          <span className="text-xl">🐝</span>
        </button>
        <button
          className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
            activeView === "analytics" ? "bg-[#e85d27] text-white" : "text-gray-400 hover:text-white hover:bg-[#222]"
          }`}
          onClick={() => onViewChange("analytics")}
          title="Analytics"
        >
          <span className="text-xl">📊</span>
        </button>
      </nav>

      <div className="mt-auto">
        <button className="flex items-center justify-center w-10 h-10 rounded-md text-gray-400 hover:text-white hover:bg-[#222]" title="Settings">
          ⚙
        </button>
      </div>
    </aside>
  );
}
