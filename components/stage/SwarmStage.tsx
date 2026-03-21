import { agents, skillDescriptions } from "@/lib/agents";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function SwarmStage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="mc-stage col-span-2 flex-1 bg-[#0a0a0a] text-[#f0f0f0]">
      <div className="h-full overflow-y-auto custom-scrollbar p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Swarms Showcase</h1>
          <p className="text-gray-400">Live overview of all active agents and their capabilities.</p>
        </div>
        
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {agents.map(agent => (
            <motion.div 
              key={agent.id} 
              variants={itemVariants}
              className="relative p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors duration-300 flex flex-col shadow-xl"
            >
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-[10px] uppercase tracking-wider text-green-500 font-bold">Online</span>
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 flex items-center justify-center text-2xl bg-black/30 rounded-full border border-white/5">
                  {agent.emoji}
                </div>
                <div>
                  <h3 className="font-semibold text-lg leading-tight">{agent.name}</h3>
                  <p className="text-xs text-gray-400">{agent.role}</p>
                </div>
              </div>
              
              <p className="text-sm text-gray-300 mb-6 flex-1 line-clamp-3">
                {agent.soul}
              </p>
              
              <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-white/10">
                {agent.skills.map(skill => (
                  <span 
                    key={skill} 
                    title={skillDescriptions[skill] || skill}
                    className="px-2 py-1 text-[10px] uppercase tracking-wider rounded-md bg-black/40 text-gray-300 border border-white/5"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
