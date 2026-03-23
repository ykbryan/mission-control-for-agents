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
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

const SHELLDON_SWARM_MEMBERS = [
  "Evelyn", "Brainy", "Kat", "Looker", "Omega", "Gorilla", "Mother", "Norton"
];

const OCTONAUTS_SWARM_MEMBERS = [
  "Angel", "Bob", "Charles", "Faith", "Hex", "Ivy", "Jelly", "Queen", "Roy", "Tommy"
];

export default function SwarmStage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const shelldonSwarm = agents.filter(a => SHELLDON_SWARM_MEMBERS.includes(a.name));
  const octonautsSwarm = agents.filter(a => OCTONAUTS_SWARM_MEMBERS.includes(a.name));
  const unassigned = agents.filter(a => 
    !SHELLDON_SWARM_MEMBERS.includes(a.name) && !OCTONAUTS_SWARM_MEMBERS.includes(a.name)
  );

  const renderAgentCard = (agent: any) => (
    <motion.div 
      key={`${agent.routerId ?? ""}--${agent.id}`}
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
        {agent.skills.map((skill: string) => (
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
  );

  const renderGridSection = (title: string, groupAgents: any[]) => {
    if (groupAgents.length === 0) return null;
    
    return (
      <div className="mb-12">
        <h2 className="text-2xl font-semibold mb-6 pb-2 border-b border-white/10 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent w-fit">
          {title}
        </h2>
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {groupAgents.map(renderAgentCard)}
        </motion.div>
      </div>
    );
  };

  return (
    <div className="mc-stage col-span-2 flex-1 bg-[#0a0a0a] text-[#f0f0f0]">
      <div className="h-full overflow-y-auto custom-scrollbar p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Swarms Showcase</h1>
          <p className="text-gray-400">Live overview of all active agents and their capabilities.</p>
        </div>
        
        {renderGridSection("Shelldon Swarm", shelldonSwarm)}
        {renderGridSection("Octonauts Swarm", octonautsSwarm)}
        {renderGridSection("Unassigned", unassigned)}
      </div>
    </div>
  );
}
