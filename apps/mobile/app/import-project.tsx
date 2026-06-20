import { Stack } from "expo-router";
import { ImportProjectScreen } from "@/features/projects/ImportProjectScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function ImportProjectRoute() {
  return (
    <>
      <ImportProjectScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Import Project")} />
    </>
  );
}
