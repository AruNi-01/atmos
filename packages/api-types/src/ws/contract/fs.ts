import type { WsEmpty } from "../dto/common";
import type {
  FsCreateDirRequest,
  FsCreateDirResponse,
  FsDeletePathRequest,
  FsDeletePathResponse,
  FsDuplicatePathRequest,
  FsDuplicatePathResponse,
  FsHomeDirResponse,
  FsListDirRequest,
  FsListDirResponse,
  FsListProjectFilesRequest,
  FsListProjectFilesResponse,
  FsReadFileRequest,
  FsReadFileResponse,
  FsReadFilesRequest,
  FsReadFilesResponse,
  FsRenamePathRequest,
  FsRenamePathResponse,
  FsSearchContentRequest,
  FsSearchContentResponse,
  FsSearchDirsRequest,
  FsSearchDirsResponse,
  FsValidateGitPathRequest,
  FsValidateGitPathResponse,
  FsWriteFileRequest,
  FsWriteFileResponse,
} from "../dto/fs";

export type FsContract = {
  fs_get_home_dir: { input: WsEmpty; output: FsHomeDirResponse };
  fs_list_dir: { input: FsListDirRequest; output: FsListDirResponse };
  fs_search_dirs: { input: FsSearchDirsRequest; output: FsSearchDirsResponse };
  fs_validate_git_path: {
    input: FsValidateGitPathRequest;
    output: FsValidateGitPathResponse;
  };
  fs_read_file: { input: FsReadFileRequest; output: FsReadFileResponse };
  fs_read_files: { input: FsReadFilesRequest; output: FsReadFilesResponse };
  fs_write_file: { input: FsWriteFileRequest; output: FsWriteFileResponse };
  fs_create_dir: { input: FsCreateDirRequest; output: FsCreateDirResponse };
  fs_rename_path: { input: FsRenamePathRequest; output: FsRenamePathResponse };
  fs_delete_path: { input: FsDeletePathRequest; output: FsDeletePathResponse };
  fs_duplicate_path: {
    input: FsDuplicatePathRequest;
    output: FsDuplicatePathResponse;
  };
  fs_list_project_files: {
    input: FsListProjectFilesRequest;
    output: FsListProjectFilesResponse;
  };
  fs_search_content: {
    input: FsSearchContentRequest;
    output: FsSearchContentResponse;
  };
};
