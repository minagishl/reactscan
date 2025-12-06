import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

export const confirmPrompt = async (message: string): Promise<boolean> => {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(message);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
};
