"use client";

import { Agent } from "@/lib/agents";
import { motion, Variants } from "framer-motion";

interface Props {
  agent: Agent;
  onBack: () => void;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function AgentProfileStage({ agent, onBack }: Props) {
  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] text-zinc-100 p-8">
      <div className="flex justify-between items-center mb-12 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors px-4 py-2 bg-zinc-900/50 rounded-lg border border-zinc-800/50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Canvas
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center max-w-4xl mx-auto w-full">
        {/* Floating Avatar */}
        <motion.div
          animate={{ y: [0, -15, 0], rotate: [-1, 1, -1] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
          className="w-32 h-32 text-6xl bg-zinc-900 border-2 border-orange-500/50 rounded-3xl flex items-center justify-center shadow-lg shadow-orange-500/10 mb-8 shrink-0"
        >
          {agent.emoji}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 shrink-0"
        >
          <h1 className="text-4xl font-bold text-zinc-100 mb-4">{agent.name}</h1>
          <div className="text-xl text-zinc-400 max-w-2xl mx-auto italic">"{agent.soul}"</div>
        </motion.div>

        {/* Skills Matrix */}
        <div className="w-full">
          <h3 className="text-sm font-bold text-orange-500 uppercase tracking-widest mb-6 px-2">Skills Matrix</h3>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {agent.skills.map((skill, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex items-center gap-3 hover:border-orange-500/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-medium text-zinc-300">{skill}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
