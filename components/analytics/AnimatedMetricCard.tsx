"use client";

import React from "react";
import CountUp from "react-countup";
import { motion } from "framer-motion";

interface Props {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export default function AnimatedMetricCard({ title, value, prefix = "", suffix = "", decimals = 0 }: Props) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-[#111] border border-[#333] rounded-xl p-6 flex flex-col justify-center items-start shadow-lg transition-colors hover:border-[#e85d27]"
    >
      <h3 className="text-sm text-[#888] font-medium uppercase tracking-wider mb-2">{title}</h3>
      <div className="text-3xl font-bold text-[#f0f0f0] flex items-baseline gap-1">
        {prefix && <span className="text-xl text-[#666]">{prefix}</span>}
        <CountUp start={0} end={value} duration={2.5} separator="," decimals={decimals} />
        {suffix && <span className="text-xl text-[#666]">{suffix}</span>}
      </div>
    </motion.div>
  );
}
