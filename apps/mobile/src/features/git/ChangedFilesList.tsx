import { StyleSheet, Text, View } from "react-native";
import type { GitChangedFile } from "@/api/types";
import { buildChangedFileGroups, countChangedFiles, type ChangedFileAction } from "@/features/git/changed-files";
import { EmptyState } from "@/ui/layout/app-screen";
import { NativeButton } from "@/ui/primitives/native-controls";
import { Row, Separator } from "@/ui/layout/row";
import { colors } from "@/theme/colors";

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
  if (files.length === 0) return null;

  return (
    <View>
      <Text selectable style={styles.groupLabel}>
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
              <NativeButton
                label={actionLabel}
                onPress={() => onAction(file)}
                disabled={actionsDisabled}
              />
            </View>
          </Row>
          {index < files.length - 1 ? <Separator /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    minWidth: 82,
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
