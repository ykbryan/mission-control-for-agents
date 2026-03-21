import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Example pricing per 1M tokens
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'gemini-3.1-pro-preview': { input: 1.25, output: 5.0, cacheRead: 0.3 },
  'gemini-3.5-pro-preview': { input: 1.25, output: 5.0, cacheRead: 0.3 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3, cacheRead: 0.01875 },
  'gpt-5.4': { input: 10.0, output: 30.0, cacheRead: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3 },
  'minimax-m2.7:cloud': { input: 0.1, output: 0.1, cacheRead: 0.0 },
  'qwen3.5:397b-cloud': { input: 0.5, output: 1.5, cacheRead: 0.0 },
};

function calculateCost(model: string, inputTokens: number = 0, outputTokens: number = 0, cacheRead: number = 0) {
  const rates = PRICING[model] || { input: 1.0, output: 3.0, cacheRead: 0.2 };
  return ((inputTokens / 1_000_000) * rates.input) +
         ((outputTokens / 1_000_000) * rates.output) +
         ((cacheRead / 1_000_000) * rates.cacheRead);
}

export async function GET() {
  try {
    const { stdout } = await execAsync('openclaw status --usage --json', { maxBuffer: 10 * 1024 * 1024 });
    const data = JSON.parse(stdout);

    const agentCosts = (data.sessions?.byAgent || []).map((agentData: any) => {
      let totalInput = 0;
      let totalOutput = 0;
      let totalCacheRead = 0;
      let totalCost = 0;

      (agentData.recent || []).forEach((session: any) => {
        const input = session.inputTokens || 0;
        const output = session.outputTokens || 0;
        const cache = session.cacheRead || 0;
        
        totalInput += input;
        totalOutput += output;
        totalCacheRead += cache;
        totalCost += calculateCost(session.model || 'unknown', input, output, cache);
      });

      return {
        agentId: agentData.agentId,
        date: new Date().toISOString().split('T')[0],
        tokens: totalInput + totalOutput + totalCacheRead,
        estimatedCost: Number(totalCost.toFixed(4)),
      };
    });

    return NextResponse.json(agentCosts);
  } catch (error) {
    console.error('Failed to fetch telemetry:', error);
    return NextResponse.json({ error: 'Failed to fetch telemetry' }, { status: 500 });
  }
}
