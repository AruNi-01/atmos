import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton, NativeTextInput } from "@/ui/primitives/native-controls";
import { Row, Separator } from "@/ui/layout/row";
import { getProjectImportReadiness, validationMatchesPath } from "@/features/projects/import-project-validation";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { wsActions } from "@/api/ws-actions";
import type { FsEntry } from "@/api/types";
import { colors } from "@/theme/colors";

export function ImportProjectScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { client, state } = useMobileWs();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [currentDir, setCurrentDir] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isConnected = Boolean(client && state === "open");

  const home = useQuery({
    queryKey: ["fs-home", state],
    enabled: isConnected,
    queryFn: () => wsActions.fsGetHomeDir(client!),
  });

  useEffect(() => {
    if (!home.data?.path || currentDir) return;
    setCurrentDir(home.data.path);
    setPath(home.data.path);
  }, [currentDir, home.data?.path]);

  const directory = useQuery({
    queryKey: ["fs-list-dir", currentDir, state],
    enabled: Boolean(isConnected && currentDir),
    queryFn: () => wsActions.fsListDir(client!, currentDir, true),
  });

  const trimmedSearch = search.trim();
  const searchResults = useQuery({
    queryKey: ["fs-search-dirs", currentDir, trimmedSearch, state],
    enabled: Boolean(isConnected && currentDir && trimmedSearch.length >= 2),
    queryFn: () => wsActions.fsSearchDirs(client!, currentDir, trimmedSearch),
  });

  const visibleEntries = useMemo(() => {
    if (trimmedSearch.length >= 2) return searchResults.data?.entries ?? [];
    return directory.data?.entries ?? [];
  }, [directory.data?.entries, searchResults.data?.entries, trimmedSearch.length]);

  const validate = useMutation({
    mutationFn: async () => {
      if (!client || !isConnected) throw new Error("Connect to a Computer first.");
      const validatedPath = path.trim();
      const result = await wsActions.fsValidateGitPath(client, validatedPath);
      return { path: validatedPath, result };
    },
    onSuccess: (validation) => {
      setError(validation.result.is_valid ? null : validation.result.error ?? "This path is not a usable project.");
      if (validation.result.suggested_name && !name.trim()) {
        setName(validation.result.suggested_name);
      }
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Path validation failed."),
  });

  const createProject = useMutation({
    mutationFn: async () => {
      if (!client || !isConnected) throw new Error("Connect to a Computer first.");
      const currentReadiness = getProjectImportReadiness({
        isConnected,
        isCreating: false,
        name,
        path,
        validation: validate.data,
      });
      if (!currentReadiness.canImport) {
        throw new Error(currentReadiness.reason ?? "Validate the remote path before importing.");
      }
      return wsActions.projectCreate(client, {
        name: name.trim(),
        main_file_path: path.trim(),
      });
    },
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-bootstrap"] });
      router.replace({
        pathname: "/create-workspace",
        params: { projectGuid: project.guid },
      });
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "Project import failed."),
  });
  const readiness = getProjectImportReadiness({
    isConnected,
    isCreating: createProject.isPending,
    name,
    path,
    validation: validate.data,
  });

  const updatePath = (nextPath: string) => {
    setPath(nextPath);
    validate.reset();
    setError(null);
  };

  const chooseEntry = (entry: FsEntry) => {
    updatePath(entry.path);
    if (!name.trim()) setName(entry.name);
  };

  const openDirectory = (entry: FsEntry) => {
    if (!entry.is_dir) return;
    setCurrentDir(entry.path);
    setSearch("");
    updatePath(entry.path);
  };

  const listError =
    home.error instanceof Error
      ? home.error.message
      : directory.error instanceof Error
        ? directory.error.message
        : searchResults.error instanceof Error
          ? searchResults.error.message
          : null;

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
          <NativeButton
            label={createProject.isPending ? "Importing..." : "Import Project"}
            disabled={!readiness.canImport}
            onPress={() => createProject.mutate()}
          />
          {readiness.reason ? (
            <Text selectable style={styles.footerHint}>
              {readiness.reason}
            </Text>
          ) : null}
        </View>
      }
    >
      <Section label="Remote Path">
        <View style={styles.block}>
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={updatePath}
            placeholder="/home/aaryn/project"
            value={path}
          />
          <NativeButton
            label={validate.isPending ? "Validating..." : "Validate Path"}
            onPress={() => validate.mutate()}
            disabled={!isConnected || !path.trim() || validate.isPending}
          />
          <Text selectable style={styles.help}>
            Mobile import selects a path on the remote Atmos Computer. It does not clone from this phone.
          </Text>
        </View>
      </Section>

      <Section label="Browse Remote Computer">
        <View style={styles.block}>
          <View style={styles.pathRow}>
            <Text selectable style={styles.currentDir} numberOfLines={1}>
              {currentDir || "Loading home directory..."}
            </Text>
            <NativeButton
              label="Home"
              disabled={!home.data?.path}
              onPress={() => {
                if (!home.data?.path) return;
                setCurrentDir(home.data.path);
                setSearch("");
                updatePath(home.data.path);
              }}
            />
          </View>
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearch}
            placeholder="Search directories"
            value={search}
          />
        </View>

        {directory.data?.parent_path && trimmedSearch.length < 2 ? (
          <>
            <Row
              title="Parent directory"
              subtitle={directory.data.parent_path}
            >
              <NativeButton
                label="Open"
                onPress={() => {
                  setCurrentDir(directory.data!.parent_path!);
                  setSearch("");
                }}
              />
            </Row>
            <Separator />
          </>
        ) : null}

        {visibleEntries.length === 0 ? (
          <EmptyState
            title={trimmedSearch.length >= 2 ? "No matching directories" : "No directories"}
            message={
              state === "open"
                ? "Use a different search term or type the path manually."
                : "Connect to a Computer before browsing remote paths."
            }
          />
        ) : (
          <View>
            {visibleEntries.map((entry, index) => (
              <View key={entry.path}>
                <Row
                  title={entry.name}
                  subtitle={entry.path}
                  meta={entry.is_git_repo ? "Git" : undefined}
                >
                  <View style={styles.entryActions}>
                    <NativeButton label="Open" onPress={() => openDirectory(entry)} />
                    <NativeButton label="Use" onPress={() => chooseEntry(entry)} />
                  </View>
                </Row>
                {index < visibleEntries.length - 1 ? <Separator /> : null}
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section label="Project">
        <View style={styles.block}>
          <NativeTextInput
            onChangeText={setName}
            placeholder="Project name"
            value={name}
          />
          {validate.data && validationMatchesPath(validate.data, path) ? (
            <Row
              title={validate.data.result.is_valid ? "Path is ready" : "Path needs attention"}
              subtitle={validate.data.result.default_branch ? `Default branch: ${validate.data.result.default_branch}` : "No default branch reported"}
              meta={validate.data.result.is_git_repo ? "Git" : undefined}
            />
          ) : null}
        </View>
      </Section>

      <InlineError message={error ?? listError} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 12,
    padding: 16,
  },
  currentDir: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 13,
  },
  entryActions: {
    flexDirection: "row",
    gap: 8,
  },
  footer: {
    gap: 10,
  },
  footerHint: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  help: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  pathRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
});
