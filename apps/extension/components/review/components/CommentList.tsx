import { i18n } from "#i18n";
import { API_BASE } from "@/components/review/api";
import type { CommentItem } from "@/components/review/types";
import { formatDateTime } from "@/utils/review-utils";
import type { RefObject } from "react";
import { browser } from "wxt/browser";
import StarIcons from "../../StarIcon";

type Props = {
  comments: CommentItem[];
  currentUserId?: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  isVoting: boolean;
  isDeleting: boolean;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  onVote: (commentId: string, direction: "upvote" | "downvote") => void;
  onEdit: (comment: CommentItem) => void;
  onDelete: (commentId: string) => void;
};

const avatarUrl = (comment: CommentItem) =>
  comment.user.id.startsWith("anonymous:")
    ? browser.runtime.getURL("/no_profile.png")
    : `${API_BASE}/user/avatar/${comment.user.id}`;

export function CommentList({
  comments,
  currentUserId,
  isAuthenticated,
  isLoading,
  isFetchingMore,
  isVoting,
  isDeleting,
  loadMoreRef,
  onVote,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-2">
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex animate-pulse gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <span className="h-10 w-10 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <span className="block h-3 w-1/3 rounded-full bg-slate-200" />
                <span className="block h-4 rounded-full bg-slate-200" />
                <span className="block h-3 w-2/3 rounded-full bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && comments.length === 0 && (
        <p className="text-xs text-slate-500">{i18n.t("reviewBoard.noComments")}</p>
      )}

      {!isLoading &&
        comments.map((comment) => {
          const mine = currentUserId === comment.user.id;
          return (
            <article
              key={comment.id}
              className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm transition ${
                mine ? "border-[#fc4d50]/40 bg-[#fc4d50]/10" : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-100">
                  <img
                    src={avatarUrl(comment)}
                    alt={`${comment.user.username} avatar`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {comment.user.username}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatDateTime(comment.updatedAt)}
                      </p>
                    </div>
                    <StarIcons score={comment.score} size={12} />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-900">{comment.content}</p>
                </div>
              </div>
              <footer className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-[#fc4d50] transition hover:border-[#fc4d50]/70 disabled:opacity-60"
                  onClick={() => onVote(comment.id, "upvote")}
                  disabled={!isAuthenticated || isVoting}
                  aria-label={i18n.t("reviewBoard.vote.like")}
                >
                  <span>👍</span>
                  <span>{comment.upvotes ?? 0}</span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-500 transition hover:border-[#fc4d50]/40 disabled:opacity-60"
                  onClick={() => onVote(comment.id, "downvote")}
                  disabled={!isAuthenticated || isVoting}
                  aria-label={i18n.t("reviewBoard.vote.dislike")}
                >
                  <span>👎</span>
                  <span>{comment.downvotes ?? 0}</span>
                </button>
                {mine && (
                  <>
                    <button
                      type="button"
                      className="ml-auto text-slate-500 hover:text-slate-900"
                      onClick={() => onEdit(comment)}
                    >
                      {i18n.t("reviewBoard.submit.edit")}
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700 disabled:opacity-60"
                      onClick={() => onDelete(comment.id)}
                      disabled={isDeleting}
                    >
                      {i18n.t("reviewBoard.submit.delete")}
                    </button>
                  </>
                )}
              </footer>
            </article>
          );
        })}

      {isFetchingMore && (
        <p className="text-center text-xs text-slate-500">
          {i18n.t("reviewBoard.loader.loadingMore")}
        </p>
      )}
      <div ref={loadMoreRef} className="h-px" />
    </div>
  );
}
