import { startMcpFromArgv } from "./args";
import { serveMcpStdio } from "./server";

const code = await startMcpFromArgv(
  process.argv.slice(2),
  process.env.PT_DESIGN_FILE,
  serveMcpStdio,
);
if (code !== undefined) process.exitCode = code;
