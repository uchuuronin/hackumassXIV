// The tool list. Any lane can register a tool; Gemini is only ever shown name, description and parameters.
import type { Tool } from '@/shared/tools';

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  tools.set(tool.name, tool);
}
export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}
export function listTools(): Tool[] {
  return [...tools.values()];
}
