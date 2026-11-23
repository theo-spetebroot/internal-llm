import { Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useChatStore } from '@/chat/chat-context';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import {
  CONVERSATION_TITLE_MAX_LENGTH,
  useDeleteConversation,
  type Conversation,
} from './conversations-api';

interface TitleEditorProps {
  title: string;
  onSave: (title: string) => void;
  onClose: () => void;
}

/**
 * The title, editable in place: Enter or leaving the field saves, Escape cancels, an empty
 * or unchanged title changes nothing.
 */
export function TitleEditor({ title, onSave, onClose }: TitleEditorProps) {
  const [value, setValue] = useState(title);
  // Escape also blurs the field when it closes: don't save what was just cancelled.
  const cancelled = useRef(false);

  const save = () => {
    if (cancelled.current) return;
    cancelled.current = true;
    onClose();
    const next = value.trim();
    if (next !== '' && next !== title) onSave(next);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <input
        aria-label="Titre de la conversation"
        value={value}
        maxLength={CONVERSATION_TITLE_MAX_LENGTH}
        autoFocus
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancelled.current = true;
            onClose();
          }
        }}
        className="h-10 w-full rounded-lg border border-accent bg-raised px-2.5 font-serif text-lg font-medium outline-3 outline-focus md:text-[22px]"
      />
    </form>
  );
}

export function RenameButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Renommer la conversation"
      title="Renommer la conversation"
      onClick={onClick}
    >
      <Pencil className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
    </Button>
  );
}

/** Delete button and its confirmation; goes back to the home page once deleted. */
export function DeleteConversationButton({ conversation }: { conversation: Conversation }) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteConversation(conversation.id);
  const store = useChatStore();
  const navigate = useNavigate();

  const confirm = () => {
    store.stop(conversation.id);
    remove.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        void navigate('/', { replace: true });
      },
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Supprimer la conversation"
          title="Supprimer la conversation"
        >
          <Trash2 className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Supprimer cette conversation ?</AlertDialogTitle>
        <AlertDialogDescription>
          « {conversation.title} » et tous ses messages seront supprimés définitivement.
        </AlertDialogDescription>
        {remove.isError && (
          <p
            role="alert"
            className="rounded-[10px] bg-danger-bg px-3.5 py-3 text-sm text-danger-ink"
          >
            La suppression a échoué. Réessayez dans un instant.
          </p>
        )}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          {/* Not an AlertDialog.Action: the dialog stays open until the deletion succeeds. */}
          <Button
            disabled={remove.isPending}
            onClick={confirm}
            className="bg-danger-ink text-paper hover:bg-danger-ink/90"
          >
            {remove.isPending ? 'Suppression…' : 'Supprimer'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
