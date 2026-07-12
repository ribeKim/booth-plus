import { i18n } from "#i18n";
import { IconAlertTriangle, IconLock, IconTrash, IconX } from "@tabler/icons-react";
import type { CommentItem } from "../types";

type Props = {
  comment: CommentItem | null;
  password: string;
  error: string;
  isDeleting: boolean;
  onPasswordChange: (password: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteCommentDialog({
  comment,
  password,
  error,
  isDeleting,
  onPasswordChange,
  onCancel,
  onConfirm,
}: Props) {
  if (!comment) return null;

  const requiresPassword = comment.canManage;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isDeleting) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-comment-title"
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <IconAlertTriangle size={20} stroke={1.8} />
          </span>
          <div>
            <h2 id="delete-comment-title" className="text-base font-bold text-slate-900">
              {i18n.t("reviewBoard.deleteDialog.title")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {requiresPassword
                ? i18n.t("reviewBoard.deleteDialog.anonymousDescription")
                : i18n.t("reviewBoard.deleteDialog.description")}
            </p>
          </div>
          <button
            type="button"
            className="ml-auto rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label={i18n.t("reviewBoard.deleteDialog.cancel")}
          >
            <IconX size={18} />
          </button>
        </div>

        <blockquote className="mt-4 line-clamp-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          {comment.content}
        </blockquote>

        {requiresPassword && (
          <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="delete-password">
            {i18n.t("reviewBoard.anonymous.password")}
            <span className="relative mt-1 block">
              <IconLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                id="delete-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                minLength={6}
                maxLength={128}
                required
                value={password}
                disabled={isDeleting}
                onChange={(event) => onPasswordChange(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                placeholder={i18n.t("reviewBoard.deleteDialog.passwordPlaceholder")}
              />
            </span>
          </label>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={isDeleting}
            onClick={onCancel}
          >
            {i18n.t("reviewBoard.deleteDialog.cancel")}
          </button>
          <button
            type="submit"
            className="flex-1 rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            disabled={isDeleting || (requiresPassword && password.length < 6)}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <IconTrash size={15} />
              {isDeleting
                ? i18n.t("reviewBoard.submit.deleting")
                : i18n.t("reviewBoard.deleteDialog.confirm")}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
