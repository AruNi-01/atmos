import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  Button,
  Label,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@workspace/ui';
import { useProjectStore } from '@/hooks/use-project-store';

interface CreateWorkspaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
}

export const CreateWorkspaceDialog: React.FC<CreateWorkspaceDialogProps> = ({ 
  isOpen, 
  onClose,
  defaultProjectId 
}) => {
  const projects = useProjectStore(s => s.projects);
  const addWorkspace = useProjectStore(s => s.addWorkspace);
  
  const [projectId, setProjectId] = useState(defaultProjectId || (projects.length > 0 ? projects[0].id : ''));
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update projectId if default changes
  React.useEffect(() => {
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    } else if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [defaultProjectId, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !name || !branch) return;

    setIsSubmitting(true);
    try {
      await addWorkspace({
        projectId,
        name,
        branch
      });
      onClose();
      // Reset form
      setName('');
      setBranch('main');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Workspace</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="project" className="text-right">
              Project
            </Label>
            <div className="col-span-3">
              <Select value={projectId} onValueChange={setProjectId} disabled={!!defaultProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="e.g. feature-login"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="branch" className="text-right">
              Branch
            </Label>
            <Input
              id="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="col-span-3"
              placeholder="git branch name"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !projectId || !name}>
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
