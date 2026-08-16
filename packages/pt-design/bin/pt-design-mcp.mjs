#!/usr/bin/env bun
import { serveMcpStdio } from "../src/mcp/server.ts";

const fileFlag = process.argv.findIndex((a) => a === "--file" || a === "-f");
const file =
  fileFlag >= 0 ? process.argv[fileFlag + 1] : process.env.PT_DESIGN_FILE;

await serveMcpStdio(file);
