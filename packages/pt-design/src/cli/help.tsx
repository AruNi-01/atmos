import React from "react";
import { Box, Text, render } from "ink";
import { PT_DESIGN_TOOL_DEFS } from "../agent/tool-defs";

export function HelpApp() {
  return (
    <Box flexDirection="column">
      <Text bold>PT Design</Text>
      <Text>Prototype wireframes. Agent --json on every command. Not Atmos Canvas.</Text>
      {PT_DESIGN_TOOL_DEFS.map((def) => (
        <Text key={def.name}>
          {"  "}pt-design {def.cli.join(" ")}
        </Text>
      ))}
      <Text>{"  "}Share from the board, then PT_DESIGN_COLLAB_ROOM=id,key</Text>
    </Box>
  );
}

export function renderHelp(): void {
  render(<HelpApp />);
}
