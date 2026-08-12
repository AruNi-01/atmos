import { Button, Host } from "@expo/ui";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { GitChangedFile } from "@/api/types";
import { buildChangedFileGroups, countChangedFiles, type ChangedFileAction } from "@/features/git/changed-files";
import { EmptyState } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { expoUiSecondaryStyle } from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

export function ChangedFilesList({
  stagedFiles,
  unstagedFiles,
  untrackedFiles,
  onOpenFile,
  onStage,
  onUnstage,
  actionsDisabled,
}: {
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  onOpenFile: (file: GitChangedFile) => void;
  onStage: (file: GitChangedFile) => void;
  onUnstage: (file: GitChangedFile) => void;
  actionsDisabled?: boolean;
}) {
  const groups = buildChangedFileGroups({ stagedFiles, unstagedFiles, untrackedFiles });
  const total = countChangedFiles({ stagedFiles, unstagedFiles, untrackedFiles });

  if (total === 0) {
    return <EmptyState title="No changes" message="This workspace has no staged, unstaged, or untracked files." />;
  }

  return (
    <View>
      {groups.map((group) => (
        <FileSection
          key={group.id}
          title={group.title}
          files={group.files}
          action={group.action}
          actionLabel={group.actionLabel}
          onAction={group.action === "stage" ? onStage : onUnstage}
          onOpenFile={onOpenFile}
          actionsDisabled={actionsDisabled}
        />
      ))}
    </View>
  );
}

function FileSection({
  title,
  files,
  action,
  actionLabel,
  onAction,
  onOpenFile,
  actionsDisabled,
}: {
  title: string;
  files: GitChangedFile[];
  action: ChangedFileAction;
  actionLabel: string;
  onAction: (file: GitChangedFile) => void;
  onOpenFile: (file: GitChangedFile) => void;
  actionsDisabled?: boolean;
}) {
  const theme = useMobileTheme();

  if (files.length === 0) return null;

  return (
    <View>
      <Text selectable style={[styles.groupLabel, { color: theme.colors.secondaryLabel }]}>
        {title}
      </Text>
      {files.map((file, index) => (
        <View key={`${action}:${file.path}`}>
          <Row
            title={file.path}
            subtitle={`${file.status} · +${file.additions} / -${file.deletions}`}
            onPress={() => onOpenFile(file)}
          >
            <View style={styles.action}>
              {(() => {
                const actionStyle = expoUiSecondaryStyle(theme.colors, actionsDisabled);
                return (
                  <Host
                    matchContents={{ vertical: true }}
                    colorScheme={theme.colorScheme}
                    seedColor={actionStyle.seedColor}
                    style={styles.stretchHost}
                  >
                    <Button
                      disabled={actionsDisabled}
                      label={actionLabel}
                      onPress={actionsDisabled ? undefined : () => onAction(file)}
                      modifiers={buttonStretchModifiers}
                      style={actionStyle.style}
                      variant={actionStyle.variant}
                    />
                  </Host>
                );
              })()}
            </View>
          </Row>
          {index < files.length - 1 ? <Separator /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stretchHost: {
    alignSelf: "stretch",
    width: "100%",
  },
  growHost: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  action: {
    minWidth: 96,
  },
  groupLabel: {
    backgroundColor: "transparent",
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 7,
    textTransform: "uppercase",
  },
});
