import { i18n } from "#i18n";
import type { FormEvent } from "react";
import StarIcons from "../../StarIcon";

type Props = {
  content: string;
  score: number;
  hasComment: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onContentChange: (content: string) => void;
  onScoreChange: (score: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
};

export function CommentForm({
  content,
  score,
  hasComment,
  isSaving,
  isDeleting,
  onContentChange,
  onScoreChange,
  onSubmit,
  onDelete,
}: Props) {
  const isBusy = isSaving || isDeleting;
  return (
    <form className="mt-4 space-y-4 border-t border-slate-100 pt-4" onSubmit={onSubmit}>
      <div>
        <label className="text-xs font-semibold text-slate-500" htmlFor="review-content">
          {i18n.t("userComments.title")}
        </label>
        <textarea
          id="review-content"
          rows={4}
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-inner transition focus:border-[#fc4d50]/80 focus:outline-none"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder={i18n.t("reviewBoard.placeholder")}
          disabled={isBusy}
        />
      </div>
      <div className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
        <span className="text-[11px]">{i18n.t("reviewBoard.rating")}</span>
        <StarIcons score={score} interactive onSelect={onScoreChange} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="flex-1 rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          type="submit"
          disabled={isBusy}
        >
          {isSaving
            ? i18n.t("reviewBoard.submit.saving")
            : hasComment
              ? i18n.t("reviewBoard.submit.edit")
              : i18n.t("reviewBoard.submit.new")}
        </button>
        {hasComment && (
          <button
            type="button"
            className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            onClick={onDelete}
            disabled={isBusy}
          >
            {isDeleting
              ? i18n.t("reviewBoard.submit.deleting")
              : i18n.t("reviewBoard.submit.delete")}
          </button>
        )}
      </div>
    </form>
  );
}
