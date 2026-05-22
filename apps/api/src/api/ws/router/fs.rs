use serde_json::{json, Value};

use core_service::{Result, ServiceError};

use super::{
    FsCreateDirRequest, FsDeletePathRequest, FsDuplicatePathRequest, FsListDirRequest,
    FsListProjectFilesRequest, FsReadFileRequest, FsRenamePathRequest, FsSearchContentRequest,
    FsSearchDirsRequest, FsValidateGitPathRequest, FsWriteFileRequest, WsMessageService,
};

impl WsMessageService {
    pub(super) fn handle_fs_get_home_dir(&self) -> Result<Value> {
        let home = self.fs_engine.get_home_dir()?;
        Ok(json!({ "path": home.to_string_lossy() }))
    }

    pub(super) fn handle_fs_list_dir(&self, req: FsListDirRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;

        let entries = if req.ignore_not_found && !path.exists() {
            Vec::new()
        } else {
            self.fs_engine
                .list_dir(&path, req.dirs_only, req.show_hidden)?
        };

        let parent_path = self.fs_engine.get_parent(&path);

        let entries_json: Vec<Value> = entries
            .into_iter()
            .map(|e| {
                json!({
                    "name": e.name,
                    "path": e.path.to_string_lossy(),
                    "is_dir": e.is_dir,
                    "is_symlink": e.is_symlink,
                    "is_ignored": e.is_ignored,
                    "symlink_target": e.symlink_target,
                    "is_git_repo": e.is_git_repo,
                })
            })
            .collect();

        Ok(json!({
            "path": path.to_string_lossy(),
            "parent_path": parent_path.map(|p| p.to_string_lossy().to_string()),
            "entries": entries_json,
        }))
    }

    pub(super) fn handle_fs_validate_git_path(
        &self,
        req: FsValidateGitPathRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let result = self.fs_engine.validate_git_path(&path);

        Ok(json!({
            "is_valid": result.is_valid,
            "is_git_repo": result.is_git_repo,
            "suggested_name": result.suggested_name,
            "default_branch": result.default_branch,
            "error": result.error,
        }))
    }

    pub(super) fn handle_fs_read_file(&self, req: FsReadFileRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;

        if !path.exists() {
            return Ok(json!({
                "path": path.to_string_lossy(),
                "exists": false,
                "content": null,
                "size": 0,
                "is_symlink": false,
            }));
        }

        let (content, size, is_symlink) = self.fs_engine.read_file(&path)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "exists": true,
            "content": content,
            "size": size,
            "is_symlink": is_symlink,
        }))
    }

    pub(super) fn handle_fs_write_file(&self, req: FsWriteFileRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.fs_engine.write_file(&path, &req.content)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "success": true,
        }))
    }

    pub(super) fn handle_fs_create_dir(&self, req: FsCreateDirRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.fs_engine.create_dir(&path)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "success": true,
        }))
    }

    pub(super) fn handle_fs_rename_path(&self, req: FsRenamePathRequest) -> Result<Value> {
        let from = self.fs_engine.expand_path(&req.from)?;
        let to = self.fs_engine.expand_path(&req.to)?;
        self.fs_engine.rename_path(&from, &to)?;

        Ok(json!({
            "from": from.to_string_lossy(),
            "to": to.to_string_lossy(),
            "success": true,
        }))
    }

    pub(super) fn handle_fs_delete_path(&self, req: FsDeletePathRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.fs_engine.delete_path(&path)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "success": true,
        }))
    }

    pub(super) fn handle_fs_duplicate_path(&self, req: FsDuplicatePathRequest) -> Result<Value> {
        let from = self.fs_engine.expand_path(&req.from)?;
        let to = self.fs_engine.expand_path(&req.to)?;
        self.fs_engine.duplicate_path(&from, &to)?;

        Ok(json!({
            "from": from.to_string_lossy(),
            "to": to.to_string_lossy(),
            "success": true,
        }))
    }

    pub(super) fn handle_fs_list_project_files(
        &self,
        req: FsListProjectFilesRequest,
    ) -> Result<Value> {
        let root_path = self.fs_engine.expand_path(&req.root_path)?;
        let tree = self
            .fs_engine
            .list_project_files(&root_path, req.show_hidden)?;

        fn convert_tree(items: Vec<core_engine::FileTreeItem>) -> Vec<Value> {
            items
                .into_iter()
                .map(|item| {
                    json!({
                        "name": item.name,
                        "path": item.path.to_string_lossy(),
                        "is_dir": item.is_dir,
                        "is_symlink": item.is_symlink,
                        "is_ignored": item.is_ignored,
                        "symlink_target": item.symlink_target,
                        "children": item.children.map(convert_tree),
                    })
                })
                .collect()
        }

        Ok(json!({
            "root_path": root_path.to_string_lossy(),
            "tree": convert_tree(tree),
        }))
    }

    pub(super) fn handle_fs_search_content(&self, req: FsSearchContentRequest) -> Result<Value> {
        let root_path = self.fs_engine.expand_path(&req.root_path)?;
        let result = core_engine::search_content(
            &root_path,
            &req.query,
            req.max_results,
            req.case_sensitive,
        )
        .map_err(|e| ServiceError::Validation(format!("Search failed: {}", e)))?;

        let matches: Vec<Value> = result
            .matches
            .into_iter()
            .map(|m| {
                json!({
                    "file_path": m.file_path,
                    "line_number": m.line_number,
                    "line_content": m.line_content,
                    "match_start": m.match_start,
                    "match_end": m.match_end,
                    "context_before": m.context_before,
                    "context_after": m.context_after,
                })
            })
            .collect();

        Ok(json!({
            "matches": matches,
            "truncated": result.truncated,
        }))
    }

    pub(super) fn handle_fs_search_dirs(&self, req: FsSearchDirsRequest) -> Result<Value> {
        let root_path = self.fs_engine.expand_path(&req.root_path)?;
        let entries = self
            .fs_engine
            .search_dirs(&root_path, &req.query, req.max_results, req.max_depth)
            .map_err(|e| ServiceError::Validation(format!("Search failed: {}", e)))?;

        let entries_json: Vec<Value> = entries
            .into_iter()
            .map(|e| {
                json!({
                    "name": e.name,
                    "path": e.path.to_string_lossy(),
                    "is_dir": e.is_dir,
                    "is_symlink": e.is_symlink,
                    "is_ignored": e.is_ignored,
                    "symlink_target": e.symlink_target,
                    "is_git_repo": e.is_git_repo,
                })
            })
            .collect();

        Ok(json!({
            "entries": entries_json,
        }))
    }
}
