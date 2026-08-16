#!/usr/bin/env bun
import { runCli } from "../src/cli/bin.ts";

const code = await runCli();
process.exit(code);
