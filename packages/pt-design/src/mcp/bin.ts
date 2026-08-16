import { serveMcpStdio } from "./server";

const fileFlag = process.argv.findIndex((a) => a === "--file" || a === "-f");
const file =
  fileFlag >= 0
    ? process.argv[fileFlag + 1]
    : process.env.PT_DESIGN_FILE;

void serveMcpStdio(file);
